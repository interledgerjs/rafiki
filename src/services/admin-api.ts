import { log } from './../winston'
import Koa, { Context } from 'koa'
import createRouter, { Joi } from 'koa-joi-router'
import bodyParser from 'koa-bodyparser'
import { Server } from 'http'
import { App as RafikiApp } from '../app'
import { TokenService } from '../types/token-service'
const logger = log.child({ component: 'admin-api' })

export interface AdminApiOptions {
  host?: string,
  port?: number,
}

export interface AdminApiServices {
  app: RafikiApp,
  tokenService: TokenService,
  middleware?: Koa.Middleware
}

/**
 * TODO - Current design assumes that the same token service is used for /peer end point functions AND auth of the API
 */
export class AdminApi {
  private _koa: Koa
  private _httpServer?: Server
  private _host?: string
  private _port?: number
  constructor ({ host, port }: AdminApiOptions, { app, middleware, tokenService }: AdminApiServices) {
    this._koa = new Koa()
      .use(middleware ? middleware : async (ctx, next) => { await next() })
      .use(this._getRoutes(app, tokenService).middleware())
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

  private _getRoutes (app: RafikiApp, tokenService: TokenService) {
    const router = createRouter()

    router.use(bodyParser())
    router.route({
      method: 'get',
      path: '/health',
      handler: async (ctx: Context) => ctx.body = 'Status: ok'
    })
    router.route({
      method: 'get',
      path: '/stats',
      handler: async (ctx: Context) => ctx.body = app.stats.getStatus()
    })
    router.route({
      method: 'get',
      path: '/alerts',
      handler: async (ctx: Context) => ctx.body = { alerts: app.alerts.getAlerts() }
    })
    router.route({
      method: 'get',
      path: '/balance',
      handler: async (ctx: Context) => ctx.body = app.getBalances()
    })
    router.route({
      method: 'get',
      path: '/balance/:id',
      handler: async (ctx: Context) => {
        try {
          ctx.body = app.getBalance(ctx.request.params['id'])
        } catch (error) {
          ctx.response.status = 404
        }
      }
    })
    router.route({
      method: 'post',
      path: '/peer',
      validate: {
        body: {
          peerInfo: Joi.object().required(),
          endpointInfo: Joi.object().required()
        },
        type: 'json'
      },
      handler: async (ctx: Context) => {
        const peerInfo = ctx.request.body['peerInfo']
        const endpointInfo = ctx.request.body['endpointInfo']
        await app.addPeer(peerInfo, endpointInfo, true)
        await tokenService.create({ sub: peerInfo.id, active: true })
        ctx.response.status = 204
      }
    })
    router.route({
      method: 'get',
      path: '/peer',
      handler: async (ctx: Context) => ctx.body = app.connector.getPeerList()
    })
    router.route({
      method: 'get',
      path: '/peers/:id/token',
      handler: async (ctx: Context) => {
        const token = await tokenService.lookup({ sub: ctx.params.id, active: true })
        ctx.body = {
          token
        }
      }
    })
    router.route({
      method: 'get',
      path: '/routes',
      handler: async (ctx: Context) => ctx.body = app.connector.routingTable.getRoutingTable()['items']
    })
    return router
  }

}
