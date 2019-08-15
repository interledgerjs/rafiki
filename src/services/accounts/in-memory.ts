import { AccountInfo } from '../../types'
import { Subject } from 'rxjs'
import { PeerNotFoundError, AccountNotFoundError } from '../../errors'
import { log } from '../../winston'
import { Errors } from 'ilp-packet'
import { AccountsService, AccountSnapshot } from '.'
import { PeerService } from '../peers'
const { InsufficientLiquidityError } = Errors

interface InMemoryAccount extends AccountInfo {
  balance: bigint
}

export class InMemoryAccountsService implements AccountsService {
  static logger = log.child({ component: 'in-memory-accounts-service' })

  private _updatedAccounts: Subject<AccountSnapshot>

  private _accounts = new Map<string, InMemoryAccount[]>()

  constructor (private _peers: PeerService) {
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
      InMemoryAccountsService.logger.error(`exceeded maximum balance. proposedBalance=${newBalance.toString()} maximum balance=${account.maximumBalance.toString()}`)
      throw new InsufficientLiquidityError('exceeded maximum balance.')
    }

    if (newBalance < account.minimumBalance) {
      InMemoryAccountsService.logger.error(`insufficient funds. oldBalance=${account.balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${account.minimumBalance.toString()}`)
      throw new Error(`insufficient funds. oldBalance=${account.balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${account.minimumBalance.toString()}`)
    }

    account.balance = newBalance
    const a = Object.assign({}, account)
    this._updatedAccounts.next(a)
    return a
  }
}
