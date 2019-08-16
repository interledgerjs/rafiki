import { log } from '../../logger'
import { Context } from 'koa'
import createRouter, { Joi } from 'koa-joi-router'
import bodyParser from 'koa-bodyparser'
import { Server } from 'http'
import { Router } from '../../services/router'
import { Rafiki, RafikiMiddleware, createAuthMiddleware } from '../../rafiki'
import { TokenAuthConfig } from '../../middleware/token-auth'
import { PeerService } from '../../services/peers'
const logger = log.child({ component: 'admin-api' })

export interface AdminApiOptions {
  host?: string,
  port?: number,
}

export interface AdminApiServices {
  peers: PeerService
  auth: RafikiMiddleware | Partial<TokenAuthConfig>
  router: Router
}

/**
 * TODO - Current design assumes that the same token service is used for /peer end point functions AND auth of the API
 */
export class AdminApi {
  private _koa: Rafiki
  private _httpServer?: Server
  private _host?: string
  private _port?: number
  constructor ({ host, port }: AdminApiOptions, { auth, router, peers }: AdminApiServices) {
    this._koa = new Rafiki()
    this._koa.use(createAuthMiddleware(auth))
    this._koa.use(this._getRoutes(router, peers).middleware())
    this._host = host
    this._port = port
  }

  shutdown () {
    if (this._httpServer) this._httpServer.close()
  }

  listen () {
    const adminApiHost = this._host || '0.0.0.0'
    const adminApiPort = this._port || 7780

    this._httpServer = this._koa.listen(adminApiPort, adminApiHost)
    logger.info(`admin api listening. host=${adminApiHost} port=${adminApiPort}`)
  }

  private _getRoutes (router: Router, peers: PeerService) {
    const middlewareRouter = createRouter()

    middlewareRouter.use(bodyParser())
    middlewareRouter.route({
      method: 'get',
      path: '/health',
      handler: async (ctx: Context) => ctx.body = 'Status: ok'
    })
    middlewareRouter.route({
      method: 'get',
      path: '/stats',
      handler: async (ctx: Context) => ctx.assert(false, 500, 'not implemented')
    })
    middlewareRouter.route({
      method: 'get',
      path: '/alerts',
      handler: async (ctx: Context) => ctx.assert(false, 500, 'not implemented')
    })
    middlewareRouter.route({
      method: 'get',
      path: '/balance',
      handler: async (ctx: Context) => ctx.assert(false, 500, 'not implemented')
    })
    middlewareRouter.route({
      method: 'get',
      path: '/balance/:id',
      handler: async (ctx: Context) => {
        try {
          const peer = await peers.get(ctx.request.params['id'])
          const balance = await peer.getAccountBalance()
          ctx.body = {
            minimum: peer.info.accounts
          }
        } catch (error) {
          ctx.response.status = 404
        }
      }
    })
    middlewareRouter.route({
      method: 'post',
      path: '/peers',
      validate: {
        body: {
          peerInfo: Joi.object().required()
        },
        type: 'json'
      },
      handler: async (ctx: Context) => {
        const peerInfo = ctx.request.body['peerInfo']
        await peers.add(peerInfo)
        // TODO: Do we create the token automatically
        // await tokenService.create({ sub: peerInfo.id, active: true })
        ctx.response.status = 204
      }
    })
    middlewareRouter.route({
      method: 'get',
      path: '/peers',
      handler: async (ctx: Context) => ctx.body = await peers.list()
    })
    // router.route({
    //   method: 'get',
    //   path: '/peers/:id/token',
    //   handler: async (ctx: Context) => {
    //     const token = await tokenService.lookup({ sub: ctx.params.id, active: true })
    //     ctx.body = {
    //       token
    //     }
    //   }
    // })

    // TODO: Wait for Matt to add this to connector
    // router.route({
    //   method: 'get',
    //   path: '/routes',
    //   handler: async (ctx: Context) => ctx.body = app._connector._routingTable.getRoutingTable()['items']
    // })
    return middlewareRouter
  }
}
