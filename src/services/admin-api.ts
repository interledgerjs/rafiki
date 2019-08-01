import { log } from './../winston'
import Koa, { Context } from 'koa'
import createRouter, { Joi } from 'koa-joi-router'
import bodyParser from 'koa-bodyparser'
import { Server, createServer } from 'http'
import { App } from '../app'
import { AuthService } from '../types/auth'
const logger = log.child({ component: 'admin-api' })

export interface AdminApiOptions {
  host?: string,
  port?: number,
  useAuthentication?: boolean
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
  private useAuthentication: boolean
  constructor ({ host, port, useAuthentication }: AdminApiOptions, { app, authService }: AdminApiServices) {
    this.app = app
    this._auth = authService
    if (host) this.host = host
    if (port) this.port = port
    if (useAuthentication) this.useAuthentication = useAuthentication
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
    if (this.useAuthentication) {
      router.use(async (ctx: Context, next) => {
        const token = this._getBearerToken(ctx.request)
        const isAdmin = await this._auth.isAdminToken(token)

        if (!isAdmin) {
          ctx.response.status = 401
          return
        }

        await next()
      })
    }
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
      method: 'get',
      path: '/balance/:id',
      handler: async (ctx: Context) => {
        try {
          ctx.body = this.app.getBalance(ctx.request.params['id'])
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
        await this.app.addPeer(peerInfo, endpointInfo, true)
        await this._auth.generateAuthToken(peerInfo.id)
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
