import { AccountInfo, Logger } from '../../types'
import { Subject } from 'rxjs'
import { PeerNotFoundError, AccountNotFoundError } from '../../errors'
import { Errors } from 'ilp-packet'
import { AccountsService, AccountSnapshot } from '.'
import { PeerService } from '../peers'
import { DebugLogger } from '../../lib/debug-logger'
const { InsufficientLiquidityError } = Errors

interface InMemoryAccount extends AccountInfo {
  balance: bigint
}

export class InMemoryAccountsService implements AccountsService {

  private _log: Logger
  private _updatedAccounts: Subject<AccountSnapshot>
  private _accounts = new Map<string, InMemoryAccount[]>()

  constructor (private _peers: PeerService, log: Logger) {
    this._log = log || new DebugLogger('rafiki:in-memory-accounts-service')
    this._updatedAccounts = new Subject<AccountSnapshot>()
  }

  get updated () {
    return this._updatedAccounts.asObservable()
  }

  public async get (peerId: string, accountId?: string): Promise<AccountSnapshot> {
    const accounts = this._accounts.get(peerId)
    if (!accounts) throw new PeerNotFoundError(peerId)
    const id = accountId || (await this._peers.get(peerId)).defaultAccountId || peerId
    const account = accounts.find(account => account.id === id)
    if (!account) throw new AccountNotFoundError(id, peerId)
    return Object.assign({}, account)
  }

  public async adjustBalance (amount: bigint, peerId: string, accountId?: string | undefined): Promise<AccountSnapshot> {

    const account = await this.get(peerId, accountId) as InMemoryAccount
    const newBalance = account.balance + amount

    if (newBalance > account.maximumBalance) {
      this._log.error(`exceeded maximum balance. proposedBalance=${newBalance.toString()} maximum balance=${account.maximumBalance.toString()}`)
      throw new InsufficientLiquidityError('exceeded maximum balance.')
    }

    if (newBalance < account.minimumBalance) {
      this._log.error(`insufficient funds. oldBalance=${account.balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${account.minimumBalance.toString()}`)
      throw new Error(`insufficient funds. oldBalance=${account.balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${account.minimumBalance.toString()}`)
    }

    account.balance = newBalance
    const a = Object.assign({}, account)
    this._updatedAccounts.next(a)
    return a
  }
}
