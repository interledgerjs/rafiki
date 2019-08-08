import * as Koa from 'koa'
import { TokenService, TokenInfo } from '../types/token-service'

export function authenticate (tokenService: TokenService, authCallback?: (tokenInfo: TokenInfo) => boolean) {

  const auth = (authCallback) ? authCallback : (tokenInfo: TokenInfo) => tokenInfo.active
  return async (ctx: Koa.Context, next: () => Promise<any>) => {
    const token = getBearerToken(ctx)
    ctx.assert(token, 401, 'Bearer token required in Authorization header')
    // TODO - Need bang syntax below until https://github.com/microsoft/TypeScript/pull/32695 ships
    ctx.state.user = tokenService.introspect(token!)
    ctx.assert(auth(ctx.state.user), 401, 'Access denied')
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
