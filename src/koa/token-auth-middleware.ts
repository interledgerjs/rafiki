import * as Koa from 'koa'
import { AuthState } from './auth-state'
import { TokenInfo, IntrospectFunction } from '../services/tokens'

export interface TokenAuthState extends AuthState {
  token: string
  tokenInfo: TokenInfo
}

/**
 * Create authentication middleware based on a Bearer token and an introspection service.
 *
 * The context will implement `TokenAuthState` after being processed by this middleware
 *
 * @param introspect A function that will introspect a token and return the TokenInfo
 * @param authenticate A function that will authenticate the user based on the introspection result. Default is to check `tokenInfo.active == true`
 */
export function tokenAuthMiddleware (introspect: IntrospectFunction, authenticate?: (tokenInfo: TokenInfo) => boolean) {

  const _auth = (authenticate) ? authenticate : (tokenInfo: TokenInfo) => tokenInfo.active
  return async function auth (ctx: Koa.Context, next: () => Promise<any>) {

    // Parse out Bearer token
    ctx.state.token = getBearerToken(ctx)
    ctx.assert(ctx.state.token, 401, 'Bearer token required in Authorization header')

    // Introspect token
    ctx.state.tokenInfo = await introspect(ctx.state.token)
    ctx.assert(_auth(ctx.state.tokenInfo), 401, 'Access Denied - Invalid Token')

    // PeerId is the subject of the token
    ctx.assert(ctx.state.tokenInfo.sub, 401, 'Access Denied - No Subject in Token')
    ctx.state.user = ctx.state.tokenInfo.sub

    await next()

  }
}

function getBearerToken (ctx: Koa.Context): string | undefined {
  const auth = ctx.request.header['authorization']
  if (auth) {
    const parts = auth.split(' ')
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1]
    }
  }
  return undefined
}
