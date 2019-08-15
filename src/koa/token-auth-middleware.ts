import * as Koa from 'koa'
import { AuthState } from './auth-state'
import { TokenInfo, IntrospectFunction } from '../services/tokens'

export interface TokenAuthState extends AuthState {
  token: string
  tokenInfo: TokenInfo
}

export interface TokenAuthConfig {
  introspect: IntrospectFunction
  authenticate: (tokenInfo: TokenInfo) => boolean
}

const defaultAuthenticate = (tokenInfo: TokenInfo): boolean => {
  return Boolean(tokenInfo.active && tokenInfo.sub)
}

const defaultIntrospect: IntrospectFunction = (token: string) => {
  // TODO: Parse out JWT and convert to tokenInfo
  throw new Error('not implemented')
}

/**
 * Create authentication middleware based on a Bearer token and an introspection service.
 *
 * The context will implement `TokenAuthState` after being processed by this middleware
 *
 * @param config
 */
export function tokenAuthMiddleware (config?: Partial<TokenAuthConfig>) {

  const _auth = (config && config.authenticate) ? config.authenticate : defaultAuthenticate
  const _introspect = (config && config.introspect) ? config.introspect : defaultIntrospect

  return async function auth (ctx: Koa.Context, next: () => Promise<any>) {

    // Parse out Bearer token
    ctx.state.token = getBearerToken(ctx)
    ctx.assert(ctx.state.token, 401, 'Bearer token required in Authorization header')

    // Introspect token
    ctx.state.user = await _introspect(ctx.state.token)
    ctx.assert(_auth(ctx.state.user), 401, 'Access Denied - Invalid Token')

    await next()

  }
}

export function getBearerToken (ctx: Koa.Context): string | undefined {
  const auth = ctx.request.header['authorization']
  if (auth) {
    const parts = auth.split(' ')
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1]
    }
  }
  return undefined
}
