import { log } from './../winston'
import Koa, { Context } from 'koa'
import createRouter, { Joi } from 'koa-joi-router'
import bodyParser from 'koa-bodyparser'
import { Server, createServer } from 'http'
import { App } from '../app'
import { AuthService } from './auth';
const logger = log.child({ component: 'admin-api' })

export interface AdminApiOptions {
  host?: string,
  port?: number
}

export interface AdminApiServices {
  app: App,
  authService: AuthService
}

export class AdminApi {
  private _koa: Koa
  private app: App
  private _auth: AuthService
  private server?: Server
  private host: string
  private port: number

  constructor ({ host, port }: AdminApiOptions, { app, authService }: AdminApiServices) {
    this.app = app
    this._auth = authService
    if (host) this.host = host
    if (port) this.port = port
  }

  shutdown () {
    if (this.server) this.server.close()
  }

  listen () {
    const adminApiHost = this.host || '0.0.0.0'
    const adminApiPort = this.port || 7780

    this._koa = this._createKoaApp()
    this.server = createServer(this._koa.callback()).listen(adminApiPort, adminApiHost)
    logger.info(`admin api listening. host=${adminApiHost} port=${adminApiPort}`)
  }

  private _createKoaApp (): Koa {
    const koa = new Koa()
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
      handler: async (ctx: Context) => ctx.body = this.app.stats.getStatus()
    })
    router.route({
      method: 'get',
      path: '/alerts',
      handler: async (ctx: Context) => ctx.body = { alerts: this.app.alerts.getAlerts() }
    })
    router.route({
      method: 'get',
      path: '/balance',
      handler: async (ctx: Context) => ctx.body = this.app.getBalances()
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
        await this.app.addPeer(peerInfo, endpointInfo)
        console.log(peerInfo)
        const token = await this._auth.generateAuthToken(peerInfo.id)
        ctx.response.status = 204
      }
    })
    router.route({
      method: 'get',
      path: '/peer',
      handler: async (ctx: Context) => ctx.body = this.app.connector.getPeerList()
    })
    router.route({
      method: 'get',
      path: '/peers/:id/token',
      handler: async (ctx: Context) => {
        const token = await this._auth.getTokenByPeerId(ctx.params.id)
        ctx.body = {
          token
        }
      }
    })
    router.route({
      method: 'get',
      path: '/routes',
      handler: async (ctx: Context) => ctx.body = this.app.connector.routingTable.getRoutingTable()['items']
    })
    koa.use(router.middleware())

    return koa
  }
}
