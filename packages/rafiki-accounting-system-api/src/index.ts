import bodyParser from 'koa-bodyparser'
import { Rafiki, PeersService, AccountsService } from '@interledger/rafiki-core'
import { createSettlementApiRoutes } from './routes'
import getRawBody = require('raw-body')

export interface SettlementAdminApiOptions {
  host?: string,
  port?: number
}

export interface SettlementApiConfig {
  peers: PeersService
  accounts: AccountsService
}

export function createApp ({ peers, accounts }: SettlementApiConfig): Rafiki {

  const app = new Rafiki({ peers, accounts })

  app.use(async (ctx, next) => {
    if (ctx.request.headers['content-type'] === 'application/octet-stream') {
      ctx.disableBodyParser = true
      ctx.request.body = await getRawBody(ctx.req)
    }
    await next()
  })
  app.use(bodyParser())
  app.use(createSettlementApiRoutes().middleware())

  return app

}
