import { PeerInfo, Balance } from '../../types'
import { Client } from '../client'
import { Observable } from 'rxjs'

export interface Peer {
  readonly info: PeerInfo
  readonly client: Promise<Client>
  readonly balance: Promise<Balance>
}

export interface PeerService {
  added: Observable<PeerInfo>
  updated: Observable<PeerInfo>
  deleted: Observable<PeerInfo>

  getOrThrow: (id: string) => Promise<Peer>

  add: (peer: PeerInfo) => Promise<void>

  update: (peer: PeerInfo) => Promise<Peer>

  remove: (peerId: string) => Promise<void>

  // TODO: Should this be an iterator
  list: () => Promise<PeerInfo[]>
}
