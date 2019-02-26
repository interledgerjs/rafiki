import { Server, IncomingMessage, ServerResponse } from 'http'
import Stats from './stats'
import Config from './config'
import { Alerts } from '../middleware/business/alert'

export interface AdminApiDeps {
  stats: Stats,
  config: Config,
  alerts: Alerts
}

interface Route {
  method: 'GET' | 'POST' | 'DELETE'
  match: string
  fn: (url: string, body: object) => Promise<object | string | void>
  responseType?: string
}
export default class AdminApi {
  private server?: Server
  private stats: Stats
  private config: Config
  private routes: Route[]
  private alerts: Alerts

  constructor ({ stats, config, alerts }: AdminApiDeps) {
    this.stats = stats
    this.config = config
    this.alerts = alerts

    this.routes = [
      { method: 'GET', match: '/health$', fn: async () => 'Status: ok' },
      { method: 'GET', match: '/stats$', fn: this.getStats },
      { method: 'GET', match: '/alerts$', fn: this.getAlerts }
    ]
  }

  shutdown () {
    if (this.server) this.server.close()
  }

  listen () {
    const {
      adminApi = false,
      adminApiHost = '127.0.0.1',
      adminApiPort = 7780
    } = this.config

    if (adminApi) {
      // TODO: add logging
      // log.info('admin api listening. host=%s port=%s', adminApiHost, adminApiPort)
      this.server = new Server()
      this.server.listen(adminApiPort, adminApiHost)
      this.server.on('request', (req, res) => {
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
    return this.stats.getStatus()
  }

  private async getAlerts () {
    return {
      alerts: this.alerts.getAlerts()
    }
  }
}
