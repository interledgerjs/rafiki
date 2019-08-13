import { log } from './winston'
import Koa, { Middleware as KoaMiddleware, ParameterizedContext } from 'koa'
import compose from 'koa-compose'
import getRawBody = require('raw-body')
import {
    JSONBalanceSummary,
    PeerInfo,
    BalanceConfig
} from './types'
import { InMemoryConnector } from './services/connector/in-memory'
import {
    AlertRule,
    BalanceRule,
    ErrorHandlerRule,
    ExpireRule,
    MaxPacketAmountRule,
    RateLimitRule,
    ReduceExpiryRule,
    StatsRule,
    ThroughputRule,
    ValidateFulfillmentRule,
    HeartbeatRule
} from './rules'
import { Config, Stats, WalletConfig, AppServices, Alerts, Connector } from './services'
import createRouter, { Joi } from 'koa-joi-router'

import { isReject, serializeIlpPrepare, deserializeIlpReply, IlpPrepare } from 'ilp-packet'
import { Server } from 'net'
import { STATIC_CONDITION } from './constants'
import { PeerNotFoundError } from './errors/peer-not-found-error'
import { Peer } from './models/Peer'
import Knex from 'knex'
import { Route } from './models/Route'
import { ilpPacketMiddleware, IlpState } from './koa/ilp-packet-middleware'
import { peerMiddleWare } from './koa/peer-middleware'
import { ilpClientMiddleware, HttpClientConfig } from './koa/ilp-client-middleware'
import { AuthState } from './koa/auth-state'
import { IldcpProtocol, EchoProtocol, CcpProtocol } from './protocols'
import { Rafiki, RafikiContext } from './rafiki';
import { PeerService } from './services/peers';
import { InMemoryPeers } from './services/peers/in-memory';
import { tokenAuthMiddleware } from './koa/token-auth-middleware';

const logger = log.child({ component: 'App' })

/**
 * An instance of a Rafiki app
 */
export class App {

  private _app: Rafiki
  private _peers: PeerService
  private _connector: Connector
  private _httpServer: Server
  private _config: Config | WalletConfig

  constructor (opts: Config, koaMiddleware: KoaMiddleware, knex: Knex) {

    // TODO - Import as app services
    this._config = opts
    this._peers = new InMemoryPeers()
    this._connector = new InMemoryConnector(this._peers)
    // TODO: Pass these in?

    this._app = new Rafiki({})
    this._app.use(tokenAuthMiddleware(introspect))
  
    // Create connector
    this._connector.setGlobalPrefix(this._config.env === 'production' ? 'g' : 'test')

    const peer = peerMiddleWare({
      // Extract incoming peerId from auth and load state from connector
      getIncomingPeerId: (ctx: RafikiContext<AuthState>) => {
        ctx.assert(ctx.state.user, 401)
        return ctx.state.user
      },
      // Get outgoing peerId by querying connector routing table
      getOutgoingPeerId: (ctx: RafikiContext<{}>) => {
        ctx.assert(ctx.state.ilp.req.destination, 500)
        return this._connector.getPeerForAddress(ctx.state.ilp.req.destination)
      }
    })
    const ilpPacket = ilpPacketMiddleware({ getRawBody })
    const rules = {
      'balance': new BalanceRule(),
      'error-handler':  new ErrorHandlerRule(),
      'expire': new ExpireRule(),
      'heartbeat': new HeartbeatRule({
        heartbeatInterval: 5 * 60 * 1000,
        onFailedHeartbeat: (peerId: string) => {
          // TODO: Handle failed heartbeat
        },
        onSuccessfulHeartbeat: (peerId: string) => {
          // TODO: Handle successful heartbeat
        }
      }),
      'max-packet-amount': new MaxPacketAmountRule(),
      'rate-limit': new RateLimitRule(),
      'reduce-expiry': new ReduceExpiryRule({
        maxHoldWindow: this._config.maxHoldWindow,
        minIncomingExpirationWindow: 0.5 * this._config.minExpirationWindow,
        minOutgoingExpirationWindow: 0.5 * this._config.minExpirationWindow
      }),
      'stats': new StatsRule(),
      'throughput': new ThroughputRule(),
      'validate-fulfillment': new ValidateFulfillmentRule()
    }

    const ccp = new CcpProtocol(this._services, this._connector)
    const ildcp = new IldcpProtocol(this._services, {
      getOwnAddress: () => this._connector.getOwnAddress()
    })
    const echo = new EchoProtocol(this._services, {
      minMessageWindow: 1500 // TODO: Configure
    })

    const incoming = compose([
      // Add any imported middleware
      koaMiddleware,

      // Add peer info to context
      peer,

      // Serialize/Deserialize ILP packets
      ilpPacket,

      // Incoming Rules
      rules['stats'].incoming,
      rules['heartbeat'].incoming,
      rules['error-handler'].incoming,
      rules['max-packet-amount'].incoming,
      rules['rate-limit'].incoming,
      rules['throughput'].incoming,
      rules['reduce-expiry'].incoming,
      rules['balance'].incoming,

      // Connector
      ildcp.incoming,
      ccp.incoming
    ])

    const outgoing = compose([
      // Connector
      echo.outgoing,
      ccp.outgoing,
      ildcp.outgoing,

      // Outgoing Rules
      rules['stats'].outgoing,
      rules['balance'].outgoing,
      rules['throughput'].incoming,
      rules['reduce-expiry'].outgoing,
      rules['alert'].outgoing,
      rules['expire'].outgoing,
      rules['validate-fulfillment'].outgoing,

      // Send outgoing packets
      ilpClientMiddleware(this._services)
    ])

    const router = createRouter()
    router.route({
      method: 'post',
      path: '/ilp',
      handler: compose([
        incoming,
        outgoing
      ])
    })

    this._app.use(router.middleware())
  }

  public async listen () {
    logger.info('starting rafiki....')

    await (this._services.peers as KnexPeerInfoService).load()

    // config loads ilpAddress as 'unknown' by default
    if (this._config instanceof Config && this._config.ilpAddress !== 'unknown') {
      this._connector.addOwnAddress(this._config.ilpAddress)
    }
    await this._loadRoutesFromDataStore()

    logger.info('starting HTTP server on port ' + this._config.httpServerPort)
    this._httpServer = this._app.listen(this._config.httpServerPort)
  }

  /**
   * Instantiates the business rules specified in the peer information and attaches it to a pipeline. Creates a wrapper endpoint which connects the pipeline to
   * the original endpoint. This is then passed into the connector's addPeer. The business rules are then started and the original endpoint stored. Tells connector
   * to inherit address from the peer if it is a parent and you do not have an address.
   * @param peerInfo Peer information
   * @param endpoint An endpoint that communicates using IlpPrepares and IlpReplies
   * @param store Boolean to determine whether to persist peer and endpoint info to database
   */
  public async addPeer (peerInfo: PeerInfo, httpClientInfo: HttpClientConfig, store: boolean = false) {
    logger.info('adding new peer: ' + peerInfo.id, { peerInfo })
    this._services.peers.set(peerInfo.id, peerInfo)

    logger.info('tracking balance for peer: ' + peerInfo.id, { balance: peerInfo.rules['balance'] })
    this._services.balances.create(peerInfo.id, peerInfo.rules['balance'] as BalanceConfig)

    logger.info('creating new client for peer', { httpClientInfo })
    this._services.clients.create(peerInfo.id, httpClientInfo)

    logger.info('adding peer to connector', { httpClientInfo })
    await this._connector.addPeer(peerInfo)

    if (store) {
      await Peer.insertFromInfo(peerInfo, httpClientInfo, this._knex)
    }
  }
  public async removePeer (peerId: string, store: boolean = false) {

    logger.info('remove peer from connector', { peerId })
    await this._connector.removePeer(peerId)

    logger.info('removing balance tracking', { peerId })
    this._services.balances.delete(peerId)

    logger.info('removing peer', { peerId })
    if (store) {
      await Peer.deleteByIdWithRelations(peerId, this._knex)
    }
    this._services.peers.delete(peerId)

    logger.info('remove client for peer', { peerId })
    this._services.clients.delete(peerId)
  }

  public async close () {
    logger.info('shutting down app...')

    // TODO: Shutdown connector?

    if (this._httpServer) {
      await new Promise((resolve, reject) => {
        this._httpServer.close((err?: Error) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }
  }

  private _loadRoutesFromDataStore = async () => {
    const routes = await Route.query(this._knex)
    routes.forEach(entry => {
      if (store) {
        Route.query(this._knex).insert({
          peerId,
          targetPrefix
        }).execute().catch(error => logger.error('Could not save route in database.', { error: error.toString() }))
      }
    })
  }
}
