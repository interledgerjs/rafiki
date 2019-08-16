import Koa, { ParameterizedContext, Middleware } from 'koa'
import compose from 'koa-compose'
import createRouter from 'koa-joi-router'
import { Router } from './services/router'
import { createIlpPacketMiddleware, IlpPacketMiddlewareOptions, IlpContext, ilpAddressToPath } from './middleware/ilp-packet'
import { PeerState, createPeerMiddleware, PeerMiddlewareOptions } from './middleware/peer'
import { PeerService } from './services/peers'
import { AuthState } from './middleware/auth'
import { Config } from '.'
import { createTokenAuthMiddleware, TokenAuthConfig } from './middleware/token-auth'
import { AccountsService } from './services/accounts'
import {
  createIldcpProtocolController,
  createEchoProtocolController
} from './middleware'

export const DEFAULT_ILP_PATH = '/ilp'

export interface RafikiServices {
  router: Router
  peers: PeerService
  accounts: AccountsService
}

export interface RafikiIlpConfig extends IlpPacketMiddlewareOptions, PeerMiddlewareOptions {
  path?: string
}
export type RafikiState = PeerState & AuthState
export type RafikiContextMixin = { services: RafikiServices, ilp: IlpContext }
export type RafikiContext = Koa.ParameterizedContext<RafikiState, RafikiContextMixin>
export type ParameterizedRafikiContext<T> = Koa.ParameterizedContext<RafikiState & T, RafikiContextMixin>
export type RafikiMiddleware = Middleware<RafikiState, RafikiContextMixin>

export class Rafiki extends Koa<RafikiState, RafikiContextMixin> {

  private _router?: Router
  private _peers?: PeerService
  private _accounts?: AccountsService
  private _ilpPath?: string
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

    // Set global context that exposes services
    this.context.services = {
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
    this._ilpPath = (config) ? config.path || DEFAULT_ILP_PATH : DEFAULT_ILP_PATH
    this.use(createIlpPacketMiddleware(config))
    this.use(createPeerMiddleware(config))
  }

  public ilpRoute (ilpAddressPattern: string, handler: RafikiMiddleware) {
    // TODO: Check that ILP middleware is being used otherwise this won't work

    const path = '/' + ilpAddressToPath(ilpAddressPattern)
    .split('/').filter(Boolean).join('/') // Trim trailing slash
    .replace('*', '(.*)') // Replace wildcard with regex that only matches valid address chars
    this.use(createRouter().route({
      method: 'post',
      path,
      handler
    }).middleware())
  }

  public useIldcp () {
    this.ilpRoute('peer.config', createIldcpProtocolController())
  }

  public useEcho () {
    // TODO: This won't work yet, we need to be able to match against OWN address
    this.ilpRoute('local', createEchoProtocolController(1500))
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
  const path = config.httpServerPath
  app.use(createAuthMiddleware(auth))
  app.useIlp({ path })
  // TODO: ilpRoute needs a way to get our own address later and then setup this route
  // app.ilpRoute('get address from connector', createEchoProtocolController(1500))
  // app.ilpRoute('*', middleware)
  return app
}

export function createAuthMiddleware (auth?: RafikiMiddleware | Partial<TokenAuthConfig>): RafikiMiddleware {
  if (typeof auth === 'function') {
    return auth
  } else {
    return createTokenAuthMiddleware(auth)
  }
}
