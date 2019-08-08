import { HttpEndpoint } from './http'
import Koa from 'koa'
import createRouter, { Joi } from 'koa-joi-router'
import { parseIlpPacket } from '../koa/ilp-packet-middleware'
export class HttpEndpointManager extends Map<string, HttpEndpoint> {

  constructor (app: Koa, path: string = '/ilp') {
    super()

    app.use(parseIlpPacket)

    const router = createRouter()

    router.route({
      method: 'post',
      path: path,
      handler: async (ctx: Koa.Context, next: () => Promise<any>) => {
        ctx.assert(ctx.state.user, 401, 'Unauthenticated.')

        try {
          const endpoint = this.get(ctx.state.user.sub)
          if (!endpoint) {
            // TODO: Unknown peer. Handle unsolicited peer logic here
            ctx.response.status = 403
            return
          }
          await endpoint.handleIncomingRequest(ctx, next)
        } catch (error) {
          ctx.status = 500
        }
      }
    })

    app.use(router.middleware())

  }
}
