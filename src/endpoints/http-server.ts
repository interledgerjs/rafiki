import { HttpEndpoint } from './http'
import Koa from 'koa'
import createRouter, { Joi } from 'koa-joi-router'
const getRawBody = require('raw-body')

type AuthFunction = (token: string) => Promise<string>

export class HttpEndpointManager extends Map<string, HttpEndpoint> {

  private _auth: AuthFunction

  constructor (server: Koa, auth: AuthFunction, path: string = '/ilp') {
    super()
    this._auth = auth

    const router = createRouter()

    router.route({
      method: 'post',
      path: '/ilp',
      handler: async (ctx: Koa.Context, next) => {
        try {
          const token = this._getBearerToken(ctx.request)

          const peerId = await this._auth(token)
          if (!peerId) {
            ctx.response.status = 400
            return
          }

          const endpoint = this.get(peerId)
          if (!endpoint) {
            // TODO: Unknown peer. Handle unsolicited peer logic here
            ctx.response.status = 403
            return
          }

          const buffer = await getRawBody(ctx.req)
          const response = await endpoint.handleIncomingRequest(buffer)

          ctx.set('content-type', 'application/octet-stream')
          ctx.body = response
        } catch (error) {
          ctx.status = 500
        }
      }
    })

    server.use(router.middleware())

  }

  private _getBearerToken (request: Koa.Request): string {
    const { header } = request
    if (header['authorization']) {
      const splitAuthHeader = header['authorization'].split(' ')
      if (splitAuthHeader.length === 2 && splitAuthHeader[0] === 'Bearer') {
        return splitAuthHeader[1]
      }
    }

    return ''
  }

}
