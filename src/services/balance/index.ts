import { Balance, BalanceConfig } from '../../types'
import { PeerService } from '..'

export interface BalanceService extends PeerService<Balance> {
  create: (accountId: string, config: BalanceConfig) => Balance
}
