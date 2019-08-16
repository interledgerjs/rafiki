import Koa, { ParameterizedContext, Middleware } from 'koa'
import compose from 'koa-compose'
import createRouter from 'koa-joi-router'
import { Router } from './services/router'
import { createIlpPacketMiddleware, IlpPacketMiddlewareOptions, IlpContext } from './middleware/ilp-packet'
import { PeerState, createPeerMiddleware, PeerMiddlewareOptions } from './middleware/peer'
import { PeerService } from './services/peers'
import { AuthState } from './middleware/auth'
import { Config } from '.'
import { createClientController } from './controllers/client'
import { createTokenAuthMiddleware, TokenAuthConfig } from './middleware/token-auth'
import { AccountsService } from './services/accounts'
import {
  createIncomingHeartbeatMiddleware,
  createIncomingErrorHandlerMiddleware,
  createIncomingMaxPacketAmountMiddleware,
  createIncomingRateLimitMiddleware,
  createIncomingThroughputMiddleware,
  createIncomingReduceExpiryMiddleware,
  createIncomingBalanceMiddleware,
  createIncomingIldcpProtocolMiddleware,
  createIncomingCcpProtocolMiddleware,
  createOutgoingEchoProtocolMiddleware,
  createOutgoingThroughputMiddleware,
  createOutgoingExpireMiddleware,
  createOutgoingReduceExpiryMiddleware,
  createOutgoingBalanceMiddleware,
  createOutgoingValidateFulfillmentMiddleware
} from './middleware'

export interface RafikiServices {
  router: Router
  peers: PeerService
  accounts: AccountsService
}

export type RafikiIlpConfig = IlpPacketMiddlewareOptions & PeerMiddlewareOptions
export type RafikiState = PeerState & AuthState
export type RafikiContextMixin = { services: RafikiServices, ilp: IlpContext }
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
    this.use(createIlpPacketMiddleware(config))
    this.use(createPeerMiddleware(config))
  }
}

interface RafikiCreateAppServices extends RafikiServices {
  auth: RafikiMiddleware | Partial<TokenAuthConfig>
}

export function createApp (config: Config, { auth, peers, accounts, router }: Partial<RafikiCreateAppServices>, middleware?: RafikiMiddleware) {

  const app = new Rafiki({
    peers,
    router,
    accounts
  })

  app.use(createAuthMiddleware(auth))
  app.useIlp()

  const mw = middleware || createDefaultMiddleware(config)

  const koaRouter = createRouter()
  koaRouter.route({
    method: 'post',
    path: config.httpServerPath,
    handler: mw
  })

  app.use(koaRouter.middleware())
  return app
}

export function createAuthMiddleware (auth?: RafikiMiddleware | Partial<TokenAuthConfig>): RafikiMiddleware {
  if (typeof auth === 'function') {
    return auth
  } else {
    return createTokenAuthMiddleware(auth)
  }
}

export function createDefaultMiddleware (config: Config) {
  const incoming = compose([
    // Incoming Rules
    createIncomingHeartbeatMiddleware({
      heartbeatInterval: 5 * 60 * 1000,
      onFailedHeartbeat: (peerId: string) => {
        // TODO: Handle failed heartbeat
      },
      onSuccessfulHeartbeat: (peerId: string) => {
        // TODO: Handle successful heartbeat
      }
    }),
    createIncomingErrorHandlerMiddleware(),
    createIncomingMaxPacketAmountMiddleware(),
    createIncomingRateLimitMiddleware(),
    createIncomingThroughputMiddleware(),
    createIncomingReduceExpiryMiddleware(),
    createIncomingBalanceMiddleware(),
    createIncomingIldcpProtocolMiddleware(),
    createIncomingCcpProtocolMiddleware()
  ])

  const outgoing = compose([
    // Router
    createOutgoingEchoProtocolMiddleware(1500),

    // Outgoing Rules
    createOutgoingBalanceMiddleware(),
    createOutgoingThroughputMiddleware(),
    createOutgoingReduceExpiryMiddleware(),
    createOutgoingExpireMiddleware(),
    createOutgoingValidateFulfillmentMiddleware(),

    // Send outgoing packets
    createClientController()
  ])

  return compose([
    incoming,
    outgoing
  ])
}
