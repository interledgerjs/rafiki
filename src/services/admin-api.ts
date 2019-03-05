import { Server, IncomingMessage, ServerResponse } from 'http'
import Stats from './stats'
import Config from './config'
import { Alerts } from '../middleware/business/alert'
import SettlementEngine from './settlement-engine'
import { BalanceUpdate } from '../schemas/BalanceUpdateTyping'
import InvalidJsonBodyError from '../errors/invalid-json-body-error'
import Ajv = require('ajv')
const ajv = new Ajv()
const validateBalanceUpdate = ajv.compile(require('../schemas/BalanceUpdate.json'))

export interface AdminApiDeps {
  stats: Stats,
  config: Config,
  alerts: Alerts,
  settlementEngine: SettlementEngine
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
  private settlementEngine: SettlementEngine

  constructor ({ stats, config, alerts, settlementEngine }: AdminApiDeps) {
    this.stats = stats
    this.config = config
    this.alerts = alerts
    this.settlementEngine = settlementEngine

    this.routes = [
      { method: 'GET', match: '/health$', fn: async () => 'Status: ok' },
      { method: 'GET', match: '/stats$', fn: this.getStats },
      { method: 'GET', match: '/alerts$', fn: this.getAlerts },
      { method: 'GET', match: '/balance$', fn: this.getBalances },
      { method: 'POST', match: '/balance$', fn: this.updateBalance }
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

  private async getBalances () {
    return this.settlementEngine.getStatus()
  }

  private async updateBalance (url: string, _data: object) {
    try {
      await validateBalanceUpdate(_data)
    } catch (err) {
      const firstError = (err.errors &&
        err.errors[0]) ||
        { message: 'unknown validation error', dataPath: '' }
      throw new InvalidJsonBodyError('invalid balance update: error=' + firstError.message + ' dataPath=' + firstError.dataPath, err.errors || [])
    }
    const { peerId, amountDiff } = _data as BalanceUpdate
    const limit = this.settlementEngine.getBalanceLimits(peerId)
    this.settlementEngine.updateBalance(peerId, BigInt(amountDiff))

    return {
      'balance': this.settlementEngine.getBalance(peerId).toString(),
      'minimum': limit.min.toString(),
      'maximum': limit.max.toString()
    }
  }
}
