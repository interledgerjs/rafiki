import { log } from './../winston'
import { Server, IncomingMessage, ServerResponse } from 'http'
import Ajv from 'ajv'
import { App } from '../app'
import * as balanceUpdateSchema from '../schemas/BalanceUpdate.json'

const ajv = new Ajv()
const validateBalanceUpdate = ajv.compile(balanceUpdateSchema)
const logger = log.child({ component: 'admin-api' })

export interface AdminApiOptions {
  host?: string,
  port?: number
}

export interface AdminApiServices {
  app: App
}

interface Route {
  method: 'GET' | 'POST' | 'DELETE'
  match: string
  fn: (url: string, body: object) => Promise<object | string | void>
  responseType?: string
}

export class AdminApi {
  private app: App
  private server?: Server
  private routes: Route[]
  private host: string
  private port: number

  constructor ({ host, port }: AdminApiOptions, { app }: AdminApiServices) {
    this.app = app
    this.routes = [
      { method: 'GET', match: '/health$', fn: this.getHealth.bind(this) },
      { method: 'GET', match: '/stats$', fn: this.getStats },
      { method: 'GET', match: '/alerts$', fn: this.getAlerts },
      { method: 'GET', match: '/balance$', fn: this.getBalances },
      { method: 'POST', match: '/peer$', fn: this.addPeer },
      { method: 'GET', match: '/peer$', fn: this.getPeer }
    ]

    if (host) this.host = host
    if (port) this.port = port
  }

  shutdown () {
    if (this.server) this.server.close()
  }

  listen () {
    const adminApiHost = this.host || '0.0.0.0'
    const adminApiPort = this.port || 7780

    logger.info(`admin api listening. host=${adminApiHost} port=${adminApiPort}`)
    this.server = new Server()
    this.server.listen(adminApiPort, adminApiHost)
    this.server.on('request', (req, res) => {
      logger.debug('Received request: ' + req.url)
      this.handleRequest(req, res).catch((e) => {
        let err = e
        if (!e || typeof e !== 'object') {
          err = new Error('non-object thrown. error=' + e)
        }

        // TODO: add logging
        // log.warn('error in admin api request handler. error=%s', err.stack ? err.stack : err)
        res.statusCode = e.httpErrorCode || 500
        res.setHeader('Content-Type', 'text/plain')
        res.end(String(err))
      })
    })
  }

  private async handleRequest (req: IncomingMessage, res: ServerResponse) {
    req.setEncoding('utf8')
    let body = ''
    await new Promise((resolve, reject) => {
      req.on('data', data => body += data)
      req.once('end', resolve)
      req.once('error', reject)
    })

    const urlPrefix = (req.url || '').split('?')[0] + '$'
    logger.debug('url prefix: ' + urlPrefix)
    const route = this.routes.find((route) =>
      route.method === req.method && urlPrefix.startsWith(route.match))
    if (!route) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain')
      res.end('Not Found')
      return
    }

    const resBody = await route.fn.call(this, req.url, body && JSON.parse(body))
    if (resBody) {
      res.statusCode = 200
      if (route.responseType) {
        res.setHeader('Content-Type', route.responseType)
        res.end(resBody)
      } else {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(resBody))
      }
    } else {
      res.statusCode = 204
      res.end()
    }
  }

  private async getStats () {
    return this.app.stats.getStatus()
  }

  private async getAlerts () {
    return {
      alerts: this.app.alerts.getAlerts()
    }
  }

  private async getBalances () {
    return this.app.getBalances()
  }

  private async addPeer (url: string, _data: object) {
    const peerInfo = _data['peerInfo']
    const endpointInfo = _data['endpointInfo']

    // TODO use ajv to validate _data
    if (!peerInfo || !endpointInfo) throw new Error('invalid arguments. need peerInfo and endpointInfo')
    logger.verbose('adding peer', { peerInfo })
    await this.app.addPeer(peerInfo, endpointInfo)
  }

  private async getPeer () {
    return this.app.connector.getPeerList()
  }

  private async getHealth () {
    return 'Status: ok'
  }
}
