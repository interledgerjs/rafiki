import { PeerInfo, Balance } from '../../types'
import { Client } from '../client'
import { Service } from '..'

export interface Peer {
  readonly info: PeerInfo
  readonly client: Client
  readonly balance: Balance
}

export interface PeerService extends Service<Peer> {
}
