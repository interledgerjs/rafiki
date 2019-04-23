import Express from 'express'
import { log } from '../../winston'
import { Server } from 'http'
import * as AccountBalanceController from './controllers/accountBalanceController'
import { param } from 'express-validator/check'
import { JSONBalanceSummary } from '../../types'

const logger = log.child({ component: 'settlement-admin-api' })

export interface SettlementAdminApiOptions {
  host?: string,
  port?: number
}

export interface AdminApiServices {
  updateAccountBalance: (id: string, amountDiff: bigint) => void
  getAccountBalance: (id: string) => JSONBalanceSummary
}
export class SettlementAdminApi {

  private _server: Server
  private _host: string
  private _port: number
  private _updateAccountBalanceService: (id: string, amountDiff: bigint) => void
  private _getAccountBalanceService: (id: string) => JSONBalanceSummary

  constructor ({ host, port }: SettlementAdminApiOptions, { updateAccountBalance, getAccountBalance }: AdminApiServices) {
    this._host = host || '127.0.0.1'
    this._port = port || 4000
    this._updateAccountBalanceService = updateAccountBalance
    this._getAccountBalanceService = getAccountBalance
  }

  listen () {
    const expressApp = this._createExpressApp()
    this._server = expressApp.listen(this._port, this._host)
    logger.info(`Listening on host: ${this._host} and port: ${this._port}.`)
  }

  shutdown () {
    logger.info('Stopping server.')
    if (this._server) {
      this._server.close()
    }
  }

  private _health (request: Express.Request, response: Express.Response) {
    response.status(200).end()
  }

  private _createExpressApp (): Express.Application {
    const expressApp = Express()
    expressApp.use(Express.json())
    expressApp.get('/health', this._health.bind(this))
    expressApp.get('/accounts/:accountId/balance', [ param('accountId').exists() ], AccountBalanceController.show)
    expressApp.post('/accounts/:accountId/updateBalance', AccountBalanceController.validationRules(), AccountBalanceController.update)
    expressApp.locals.updateAccountBalance = this._updateAccountBalanceService
    expressApp.locals.getAccountBalance = this._getAccountBalanceService

    return expressApp
  }

}
