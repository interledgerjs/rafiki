import { PeerNotFoundError } from '../errors/peer-not-found-error'

export * from './admin-api'
export * from '../types/config'
export * from './wallet-config'
export * from './client'
export * from './connector'
export * from './stats'
export * from './settlement-engine'
export * from './tokens'

export interface Service<T> extends Map<string,T> {
  getOrThrow: (id: string) => T
}

export class ServiceBase<T> extends Map<string,T> implements Service<T> {
  public getOrThrow (id: string): T {
    const val = this.get(id)
    if (!val) throw new PeerNotFoundError(id)
    return val
  }
}
