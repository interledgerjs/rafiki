import { log } from './winston'
import Koa, { Middleware as KoaMiddleware, ParameterizedContext } from 'koa'
import compose from 'koa-compose'
import getRawBody = require('raw-body')
import {
    JSONBalanceSummary,
    PeerInfo,
    BalanceConfig
} from './types'
import { Connector } from './connector'
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
import { Config, Stats, WalletConfig, AppServices, Alerts } from './services'
import createRouter, { Joi } from 'koa-joi-router'

import { isReject, serializeIlpPrepare, deserializeIlpReply } from 'ilp-packet'
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
import { AxiosHttpClientService } from './services/client/axios'
import { KnexPeerInfoService } from './services/peer-info/knex'
import { InMemoryBalanceService } from './services/balance/in-memory'

const logger = log.child({ component: 'App' })

/**
 * An instance of a Rafiki app
 */
export class App {

  private _koaApp: Koa
  private _connector: Connector
  private _httpServer: Server
  private _services: AppServices
  private _config: Config | WalletConfig
  private _knex: Knex

    /**
     * Instantiates an http server which handles posts to /ilp and passes the packet on to the appropriate peer's endpoint.
     *
     * @param opts Options for the application
     * @param koaMiddleware middleware to apply to incoming HTTP requests (at a minimum it must perform auth)
     * @param knex database object for persistence
     */
  constructor (opts: Config, koaMiddleware: KoaMiddleware, knex: Knex) {

    // TODO - Import as app services
    this._config = opts
    this._knex = knex

    // TODO: Pass these in?
    this._services = {
      clients: new AxiosHttpClientService(),
      peers: new KnexPeerInfoService(this._knex),
      balances: new InMemoryBalanceService(),
      stats: new Stats(),
      alerts: new Alerts()
    }
    this._koaApp = new Koa()
    // Create connector
    this._connector = new Connector(this._services)
    this._connector._routingTable.setGlobalPrefix(this._config.env === 'production' ? 'g' : 'test')

    const peer = peerMiddleWare(this._services, {
      // Extract incoming peerId from auth and load state from connector
      getIncomingPeerId: (ctx: ParameterizedContext<AuthState>) => {
        ctx.assert(ctx.state.user, 401)
        return ctx.state.user
      },
      // Get outgoing peerId by querying connector routing table
      getOutgoingPeerId: (ctx: ParameterizedContext<IlpState>) => {
        ctx.assert(ctx.state.ilp.req.destination, 500)
        return this._connector.getNextHop(ctx.state.ilp.req.destination)
      }
    })
    const ilpPacket = ilpPacketMiddleware(this._services, { getRawBody })
    const rules = {
      'alert': new AlertRule(this._services),
      'balance': new BalanceRule(this._services),
      'error-handler':  new ErrorHandlerRule(this._services, {
        getOwnIlpAddress: () => this._connector.getOwnAddress()
      }),
      'expire': new ExpireRule(this._services),
      'heartbeat': new HeartbeatRule(this._services, {
        heartbeatInterval: 5 * 60 * 1000,
        onFailedHeartbeat: (peerId: string) => {
          // TODO: Handle failed heartbeat
        },
        onSuccessfulHeartbeat: (peerId: string) => {
          // TODO: Handle successful heartbeat
        }
      }),
      'max-packet-amount': new MaxPacketAmountRule(this._services),
      'rate-limit': new RateLimitRule(this._services),
      'reduce-expiry': new ReduceExpiryRule(this._services, {
        maxHoldWindow: this._config.maxHoldWindow,
        minIncomingExpirationWindow: 0.5 * this._config.minExpirationWindow,
        minOutgoingExpirationWindow: 0.5 * this._config.minExpirationWindow
      }),
      'stats': new StatsRule(this._services),
      'throughput': new ThroughputRule(this._services),
      'validate-fulfillment': new ValidateFulfillmentRule(this._services)
    }

    const router = createRouter()
    router.route({
      method: 'post',
      path: '/ilp',
      handler: compose([
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
        this._connector.middleware(),

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
    })

    this._koaApp.use(router.middleware())
  }

  public async start () {
    logger.info('starting rafiki....')

    await (this._services.peers as KnexPeerInfoService).load()

    // config loads ilpAddress as 'unknown' by default
    if (this._config instanceof Config && this._config.ilpAddress !== 'unknown') {
      this._connector.addOwnAddress(this._config.ilpAddress)
    }
    await this._loadRoutesFromDataStore()

    logger.info('starting HTTP server on port ' + this._config.httpServerPort)
    this._httpServer = this._koaApp.listen(this._config.httpServerPort)
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

  /**
   * Tells connector to remove its peers and clears the stored packet caches and token buckets. The connector is responsible for shutting down the peer's protocols.
   */
  public async shutdown () {
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

  // public getRules (peerId: string): Rule[] {
  //   return this._businessRulesMap.get(peerId) || []
  // }

  public getBalance = (peerId: string): JSONBalanceSummary => {
    const balance = this._services.balances.get(peerId)
    if (!balance) {
      throw new PeerNotFoundError(peerId)
    }
    return balance.toJSON()
  }

  public getBalances = () => {
    let balances = {}
    this._services.balances.forEach((value, key) => balances[key] = value.toJSON())
    return balances
  }

  public updateBalance = (peerId: string, amountDiff: bigint, scale: number): void => {
    const balance = this._services.balances.get(peerId)

    if (!balance) {
      throw new PeerNotFoundError(peerId)
    }

    const scaleDiff = balance.scale - scale
    // TODO: update to check whether scaledAmountDiff is an integer
    if (scaleDiff < 0) {
      logger.warn('Could not adjust balance due to scale differences', { amountDiff, scale })
      // TODO: should probably throw an error
      return
    }

    const scaleRatio = Math.pow(10, scaleDiff)
    const scaledAmountDiff = amountDiff * BigInt(scaleRatio)

    balance.adjust(scaledAmountDiff)
  }

  public async forwardSettlementMessage (to: string, message: Buffer): Promise<Buffer> {
    logger.debug('Forwarding settlement message', { to, message: message.toString() })
    const packet = serializeIlpPrepare({
      amount: '0',
      destination: 'peer.settle',
      executionCondition: STATIC_CONDITION,
      expiresAt: new Date(Date.now() + 60000),
      data: message
    })

    const ilpReply = deserializeIlpReply(await this._services.clients.getOrThrow(to).send(packet))

    if (isReject(ilpReply)) {
      throw new Error('IlpPacket to settlement engine was rejected')
    }

    return ilpReply.data
  }

  public addRoute (targetPrefix: string, peerId: string, store: boolean = false) {
    logger.info('adding route', { targetPrefix, peerId })
    const peer = this._connector._routeManager.getPeer(peerId)
    if (!peer) {
      const msg = 'Cannot add route for unknown peerId=' + peerId
      logger.error(msg)
      throw new Error(msg)
    }
    this._connector._routeManager.addRoute({
      peer: peerId,
      prefix: targetPrefix,
      path: []
    })

    if (store) {
      Route.query(this._knex).insert({
        peerId,
        targetPrefix
      }).execute().catch(error => logger.error('Could not save route in database.', { error: error.toString() }))
    }
  }

  private _loadRoutesFromDataStore = async () => {
    const routes = await Route.query(this._knex)
    routes.forEach(entry => this.addRoute(entry.targetPrefix, entry.peerId))
  }
}
