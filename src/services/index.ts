import { BalanceService } from './balance'
import { ClientService } from './client'
import { PeerInfoService } from './peer-info'
import { PeerNotFoundError } from '../errors/peer-not-found-error'
import { Stats } from './stats'
import { Alerts } from './alerts'

export * from './admin-api'
export * from '../types/config'
export * from './wallet-config'
export * from './stats'
export * from './alerts'
export * from './tokens/knex'
export * from './tokens/remote'

export interface PeerService<T> extends Map<string,T> {
  getOrThrow: (id: string) => T
}

export class PeerServiceBase<T> extends Map<string,T> implements PeerService<T> {
  public getOrThrow (id: string): T {
    const val = this.get(id)
    if (!val) throw new PeerNotFoundError(id)
    return val
  }

}

export interface AppServices {
  peers: PeerInfoService
  balances: BalanceService
  clients: ClientService
  stats: Stats
  alerts: Alerts
}
