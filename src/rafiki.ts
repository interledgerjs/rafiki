import Koa, { ParameterizedContext, Middleware } from 'koa'
import compose from 'koa-compose'
import createRouter from 'koa-joi-router'
import { Router } from './services/router'
import { IlpState, ilpPacketMiddleware, IlpPacketMiddlewareOptions } from './koa/ilp-packet-middleware'
import { PeerState, peerMiddleWare, PeerMiddlewareOptions } from './koa/peer-middleware'
import { PeerService } from './services/peers'
import { AuthState } from './koa/auth-state'
import { Config } from './services'
import { CcpProtocol, IldcpProtocol, EchoProtocol } from './protocols'
import { ThroughputRule, ValidateFulfillmentRule, BalanceRule, ErrorHandlerRule, ExpireRule, HeartbeatRule, MaxPacketAmountRule, RateLimitRule, ReduceExpiryRule } from './rules'
import { ilpClientMiddleware } from './koa/ilp-client-middleware'
import { tokenAuthMiddleware, TokenAuthConfig } from './koa/token-auth-middleware'
import { AccountsService } from './services/accounts'

export interface RafikiServices {
  router: Router
  peers: PeerService
  accounts: AccountsService
}

export type RafikiIlpConfig = IlpPacketMiddlewareOptions & PeerMiddlewareOptions
export type RafikiState = IlpState & PeerState & AuthState
export type RafikiContextMixin = { services: RafikiServices }
export type RafikiContext = Koa.ParameterizedContext<RafikiState, RafikiContextMixin>
export type ParameterizedRafikiContext<T> = Koa.ParameterizedContext<RafikiState & T, RafikiContextMixin>
export type RafikiMiddleware = Middleware<RafikiState, RafikiContextMixin>

export class Rafiki extends Koa<RafikiState, RafikiContextMixin> {

  private _router?: Router
  private _peers?: PeerService
  private _accounts?: AccountsService

  constructor (config?: Partial<RafikiServices>) {
    super()

    this._router = (config && config.router) ? config.router : undefined
    this._peers = (config && config.peers) ? config.peers : undefined
    this._accounts = (config && config.accounts) ? config.accounts : undefined

    const peersOrThrow = () => {
      if (this._peers) return this._peers
      throw new Error('No peers service provided to the app')
    }
    const accountsOrThrow = () => {
      if (this._accounts) return this._accounts
      throw new Error('No accounts service provided to the app')
    }
    const routerOrThrow = () => {
      if (this._router) return this._router
      throw new Error('No router service provided to the app')
    }

    // Set global middleware that exposes services
    this.use(async (ctx: ParameterizedContext<RafikiState, RafikiContextMixin>, next: () => Promise<any>) => {
      ctx.services = {
        get peers () {
          return peersOrThrow()
        },
        get router () {
          return routerOrThrow()
        },
        get accounts () {
          return accountsOrThrow()
        }
      }
      await next()
    })
  }

  public get router () {
    return this._router
  }

  public set router (router: Router | undefined) {
    this._router = router
  }

  public get peers () {
    return this._peers
  }

  public set peers (peers: PeerService | undefined) {
    this._peers = peers
  }

  public get accounts () {
    return this._accounts
  }

  public set accounts (accounts: AccountsService | undefined) {
    this._accounts = accounts
  }

  public useIlp (config?: RafikiIlpConfig) {
    this.use(ilpPacketMiddleware(config))
    this.use(peerMiddleWare(config))
  }
}

interface RafikiCreateAppServices extends RafikiServices {
  auth: RafikiMiddleware | Partial<TokenAuthConfig>
}

export function createApp (config: Config, { auth, peers, accounts, router }: Partial<RafikiCreateAppServices>, parameterMiddleware?: RafikiMiddleware) {

  const app = new Rafiki({
    peers,
    router,
    accounts
  })

  app.use(createAuthMiddleware(auth))
  app.useIlp()

  const middleware = parameterMiddleware || createDefaultMiddleware(config)

  const koaRouter = createRouter()
  koaRouter.route({
    method: 'post',
    path: config.httpServerPath,
    handler: middleware
  })

  app.use(koaRouter.middleware())
  return app
}

export function createAuthMiddleware (auth?: RafikiMiddleware | Partial<TokenAuthConfig>): RafikiMiddleware {
  if (typeof auth === 'function') {
    return auth
  } else {
    return tokenAuthMiddleware(auth)
  }
}

export function createDefaultMiddleware (config: Config) {
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
      maxHoldWindow: config.maxHoldWindow,
      minIncomingExpirationWindow: 0.5 * config.minExpirationWindow,
      minOutgoingExpirationWindow: 0.5 * config.minExpirationWindow
    }),
    'throughput': new ThroughputRule(),
    'validate-fulfillment': new ValidateFulfillmentRule()
  }

  const ccp = new CcpProtocol()
  const ildcp = new IldcpProtocol()
  const echo = new EchoProtocol({ minMessageWindow: 1500 })

  const incoming = compose([
    // Incoming Rules
    rules['heartbeat'].incoming,
    rules['error-handler'].incoming,
    rules['max-packet-amount'].incoming,
    rules['rate-limit'].incoming,
    rules['throughput'].incoming,
    rules['reduce-expiry'].incoming,
    rules['balance'].incoming,

    // Router
    ildcp.incoming,
    ccp.incoming
  ])

  const outgoing = compose([
    // Router
    echo.outgoing,

    // Outgoing Rules
    rules['balance'].outgoing,
    rules['throughput'].outgoing,
    rules['reduce-expiry'].outgoing,
    rules['expire'].outgoing,
    rules['validate-fulfillment'].outgoing,

    // Send outgoing packets
    ilpClientMiddleware()
  ])

  return compose([
    incoming,
    outgoing
  ])
}
