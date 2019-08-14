import Koa, { ParameterizedContext, Middleware } from 'koa'
import compose from 'koa-compose'
import createRouter from 'koa-joi-router'
import { Connector } from './services/connector'
import { IlpState, ilpPacketMiddleware, IlpPacketMiddlewareOptions } from './koa/ilp-packet-middleware'
import { PeerState, peerMiddleWare, PeerMiddlewareOptions } from './koa/peer-middleware'
import { PeerService } from './services/peers'
import { AuthState } from './koa/auth-state'
import { Config } from './services'
import { CcpProtocol, IldcpProtocol, EchoProtocol } from './protocols'
import { ThroughputRule, ValidateFulfillmentRule, BalanceRule, ErrorHandlerRule, ExpireRule, HeartbeatRule, MaxPacketAmountRule, RateLimitRule, ReduceExpiryRule } from './rules'
import { ilpClientMiddleware } from './koa/ilp-client-middleware'
import { tokenAuthMiddleware, TokenAuthConfig } from './koa/token-auth-middleware'
export interface RafikiServices {
  connector: Connector
  peers: PeerService
}

export type RafikiIlpConfig = IlpPacketMiddlewareOptions & PeerMiddlewareOptions

export type RafikiState = IlpState & PeerState & AuthState
export type RafikiContextMixin = { services: RafikiServices }
export type RafikiContext = Koa.ParameterizedContext<RafikiState, RafikiContextMixin>
export type ParameterizedRafikiContext<T> = Koa.ParameterizedContext<RafikiState & T, RafikiContextMixin>
export type RafikiMiddleware = Middleware<RafikiState, RafikiContextMixin>

export class Rafiki extends Koa<RafikiState, RafikiContextMixin> {

  private _connector?: Connector
  private _peers?: PeerService

  constructor (config?: Partial<RafikiServices>) {
    super()

    this._connector = (config && config.connector) ? config.connector : undefined
    this._peers = (config && config.peers) ? config.peers : undefined

    const peersOrThrow = () => {
      if (this._peers) return this._peers
      throw new Error('No peers service provided to the app')
    }
    const connectorOrThrow = () => {
      if (this._connector) return this._connector
      throw new Error('No connector service provided to the app')
    }

    // Set global middleware that exposes services
    this.use((ctx: ParameterizedContext<RafikiState, RafikiContextMixin>, next: () => Promise<any>) => {
      ctx.services = {
        get peers () {
          return peersOrThrow()
        },
        get connector () {
          return connectorOrThrow()
        }
      }
    })
  }

  public get connector () {
    return this._connector
  }

  public set connector (connector: Connector | undefined) {
    this._connector = connector
  }

  public get peers () {
    return this._peers
  }

  public set peers (peers: PeerService | undefined) {
    this._peers = peers
  }

  public useIlp (config?: RafikiIlpConfig) {
    this.use(ilpPacketMiddleware(config))
    this.use(peerMiddleWare(config))
  }
}

interface RafikiCreateAppServices extends RafikiServices {
  auth: RafikiMiddleware | Partial<TokenAuthConfig>
}

export function createApp (config: Config, { auth, peers, connector }: Partial<RafikiCreateAppServices>) {

  const app = new Rafiki({
    peers,
    connector
  })

  app.use(authMiddleware(auth))

  app.useIlp()

  // TODO: Use config to setup rules
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
    'throughput': new ThroughputRule(),
    'validate-fulfillment': new ValidateFulfillmentRule()
  }

  const ccp = new CcpProtocol()
  const ildcp = new IldcpProtocol()
  const echo = new EchoProtocol({ minMessageWindow: 1500 })

  const incoming = compose([
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

    // Outgoing Rules
    rules['stats'].outgoing,
    rules['balance'].outgoing,
    rules['throughput'].outgoing,
    rules['reduce-expiry'].outgoing,
    rules['alert'].outgoing,
    rules['expire'].outgoing,
    rules['validate-fulfillment'].outgoing,

    // Send outgoing packets
    ilpClientMiddleware()
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

  app.use(router.middleware())
  return app
}

export function authMiddleware (auth?: RafikiMiddleware | Partial<TokenAuthConfig>): RafikiMiddleware {
  if (typeof auth === 'function') {
    return auth
  } else {
    return tokenAuthMiddleware(auth)
  }
}
