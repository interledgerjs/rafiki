import { AccountInfo } from '../../types'
import { Observable } from 'rxjs'

export interface AccountSnapshot extends Readonly<AccountInfo> {
  readonly balance: bigint
}

export interface AccountsService {
  readonly updated: Observable<AccountSnapshot>

  /**
   * Load an account. Throws if the account cannot be loaded.
   */
  get: (peerId: string, accountId?: string) => Promise<AccountSnapshot>

  /**
   * Adjust the balance on a peer's account and return a snapshot of the account after the adjustment
   */
  adjustBalance: (amount: bigint, peerId: string, accountId?: string) => Promise<AccountSnapshot>

}
