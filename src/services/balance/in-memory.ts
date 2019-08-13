import { BalanceService } from '.'
import { Balance, InMemoryBalance, BalanceConfig } from '../../types'
import { PeerServiceBase } from '..'

export class InMemoryBalanceService extends PeerServiceBase<Balance> implements BalanceService {

  public create (accountId: string, config: BalanceConfig) {
    if (this.has(accountId)) throw new Error('Balance already exists for account id: ' + accountId)
    const balance = new InMemoryBalance(config)
    this.set(accountId, balance)
    return balance
  }

}
