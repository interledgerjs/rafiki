import bodyParser from 'koa-bodyparser'
import { Rafiki, PeersService, AccountsService } from '@interledger/rafiki-core'
import { createSettlementApiRoutes } from './routes'
import getRawBody = require('raw-body')
import Koa, { Context } from 'koa'
import { Server } from 'http'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import {RemoteSettlementEngine, SettlementEngine, SettlementResponse} from './services/settlement-engine'

export interface AccountingSystemConfig {
  peers: PeersService
  accounts: AccountsService,
  host?: string,
  port?: number
}

export interface AccountingSystemContext extends Context {
  services: {
    peers: PeersService,
    accounts: AccountsService
  }
}

export class AccountingSystem {

  private _peersService: PeersService
  private _accountsService: AccountsService
  private _app: Koa
  private _server: Server
  private _settlementEngine: SettlementEngine

  constructor (config: AccountingSystemConfig) {
    this._peersService = config.peers
    this._accountsService = config.accounts

    // TODO Temp want to change to a service that allows adding/removing SE's
    this._settlementEngine = new RemoteSettlementEngine('http://localhost:3000')

    this._app = new Koa<any, AccountingSystemContext>()

    this._app.use(async (ctx, next) => {
      if (ctx.request.headers['content-type'] === 'application/octet-stream') {
        ctx.disableBodyParser = true
        ctx.request.body = await getRawBody(ctx.req)
      }
      await next()
    })
    this._app.use(bodyParser())
    this._app.use(createSettlementApiRoutes().middleware())
  }

  private async getAccountOrThrow (accountId: string) {
    const account = await this._accountsService.get(accountId)
    if (!account) throw new Error('Account not found')
    return account
  }

  /**
   * Hoist information about the account out of accountService and try and add to SE corresponding SE
   * @param accountId
   */
  async addAccount (accountId: string): Promise<void> {
    const account = await this.getAccountOrThrow(accountId)
    const engine = this._settlementEngine
    await engine.addAccount(account.id)
    return
  }

  async removeAccount (accountId: string): Promise<void> {
    const account = await this.getAccountOrThrow(accountId)
    const engine = this._settlementEngine
    await engine.removeAccount(account.id)
    return
  }

  async receiveRequest (accountId: string, packet: IlpPrepare): Promise<IlpReply> {
    const account = await this.getAccountOrThrow(accountId)
    const engine = this._settlementEngine
    return engine.receiveRequest(account.id, packet)
  }

  async sendSettlement (accountId: string, amount: bigint, scale: number): Promise<void> {
    const account = await this.getAccountOrThrow(accountId)
    const engine = this._settlementEngine
    const response: SettlementResponse = await engine.sendSettlement(account.id, amount, scale)

    // TODO need to convert to accounts scale

    await this._accountsService.adjustBalancePayable(response.amount, accountId, async ({ commit }) => {
      await commit()
    })
  }

  public listen () {
    this._server = this._app.listen()
  }

  public shutdown () {
    this._server.close()
  }

}
