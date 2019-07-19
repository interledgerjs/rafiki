import Koa, { Context } from 'koa'
import bodyParser from 'koa-bodyparser'
import { log } from '../../winston'
import { Server, createServer } from 'http'
import { ApiRouter } from './routes'
import { JSONBalanceSummary } from '../../types'
import getRawBody = require('raw-body')
const logger = log.child({ component: 'settlement-admin-api' })
const MAX_ILP_PACKET_LENGTH = 32767

export interface SettlementAdminApiOptions {
  host?: string,
  port?: number
}

export interface SettlementAdminApiServices {
  updateAccountBalance: (id: string, amountDiff: bigint, scale: number) => void
  getAccountBalance: (id: string) => JSONBalanceSummary
  sendMessage: (to: string, message: Buffer) => Promise<Buffer>
}

export type AppContext = Context & SettlementAdminApiServices
export class SettlementAdminApi {
  private _koa: Koa
  private _server: Server
  private _host: string
  private _port: number
  private _updateAccountBalanceService: (id: string, amountDiff: bigint, scale: number) => void
  private _getAccountBalanceService: (id: string) => JSONBalanceSummary
  private _sendMessage: (to: string, message: Buffer) => Promise<Buffer>

  constructor ({ host, port }: SettlementAdminApiOptions, { updateAccountBalance, getAccountBalance, sendMessage }: SettlementAdminApiServices) {
    this._host = host || '127.0.0.1'
    this._port = port || 4000
    this._updateAccountBalanceService = updateAccountBalance
    this._getAccountBalanceService = getAccountBalance
    this._sendMessage = sendMessage
  }

  listen () {
    this._koa = this._createKoaApp()
    this._server = createServer(this._koa.callback()).listen(this._port)
    logger.info(`Listening on host: ${this._host} and port: ${this._port}.`)
  }

  shutdown () {
    logger.info('Stopping server.')
    if (this._server) {
      this._server.close()
    }
  }

  private _createKoaApp (): Koa {
    const koa = new Koa()
    koa.context.updateAccountBalance = this._updateAccountBalanceService
    koa.context.sendMessage = this._sendMessage
    koa.use(async (ctx, next) => {
      logger.debug('Received request', { path: ctx.request.path })
      if (ctx.request.headers['content-type'] === 'application/octet-stream') {
        ctx.disableBodyParser = true
        const buffer = await getRawBody(ctx.req).catch((error: any) => {
          logger.error('Error parsing buffer in octet-stream', { error: error.message })
        })
        ctx.request.body = buffer
      }
      await next()
    })
    koa.use(bodyParser())
    koa.use(ApiRouter().middleware())

    return koa
  }

}
