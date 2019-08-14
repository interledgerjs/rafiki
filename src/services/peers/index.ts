import { PeerInfo, Balance } from '../../types'
import { Client } from '../client'
import { Service } from '..'

export interface Peer {
  readonly info: PeerInfo
  readonly client: Client
  readonly balance: Balance
}

// TODO: This needs to emit events when a peer is added, removed or changed
export interface PeerService extends Service<Peer> {

}
