import Express from 'express'
import { log } from '../../winston'
import { Server } from 'http'
import { Threshold } from '../../types/threshold'
import * as AccountBalanceController from './controllers/accountBalanceController'
import * as AccountThresholdsController from './controllers/accountThresholdsController'

const logger = log.child({ component: 'settlement-admin-api' })

export interface SettlementAdminApiOptions {
  host?: string,
  port?: number
}

export interface AdminApiServices {
  updateAccountBalance: (id: string, amountDiff: bigint) => void
  updateAccountThresholds: (id: string, thresholds: Threshold[]) => void
}
export class SettlementAdminApi {

  private _server: Server
  private _host: string
  private _port: number
  private _updateAccountBalanceService: (id: string, amountDiff: bigint) => void
  private _updateAccountThresholdsService: (id: string, thresholds: Threshold[]) => void

  constructor ({ host, port }: SettlementAdminApiOptions, { updateAccountBalance, updateAccountThresholds }: AdminApiServices) {
    this._host = host || '127.0.0.1'
    this._port = port || 4000
    this._updateAccountBalanceService = updateAccountBalance
    this._updateAccountThresholdsService = updateAccountThresholds
  }

  connect () {
    const expressApp = this._createExpressApp()
    this._server = expressApp.listen(this._port, this._host)
    logger.info(`Listening on host: ${this._host} and port: ${this._port}.`)
  }

  disconnect () {
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
    expressApp.post('/accounts/:accountId/updateBalance', AccountBalanceController.validationRules(), AccountBalanceController.create)
    expressApp.put('/accounts/:accountId/thresholds', AccountThresholdsController.validationRules(), AccountThresholdsController.update)
    expressApp.locals.updateAccountBalance = this._updateAccountBalanceService
    expressApp.locals.updateAccountThresholds = this._updateAccountThresholdsService

    return expressApp
  }

}
