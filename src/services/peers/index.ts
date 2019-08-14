import { PeerInfo, Balance } from '../../types'
import { Client } from '../client'
import { Service } from '..'
import { Observable } from 'rxjs'

export interface Peer {
  readonly info: PeerInfo
  readonly client: Client
  readonly balance: Balance
}

export interface PeerService extends Service<Peer> {
  added: Observable<PeerInfo>
  updated: Observable<PeerInfo>
  deleted: Observable<PeerInfo>
}
