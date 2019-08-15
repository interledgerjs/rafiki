import { PeerInfo } from '../../types'
import { Observable } from 'rxjs'

export interface Peer extends Readonly<PeerInfo> {
  send: (data: Buffer) => Promise<Buffer>
}

export interface PeerService {
  readonly added: Observable<PeerInfo>
  readonly updated: Observable<PeerInfo>
  readonly deleted: Observable<PeerInfo>

  /**
   * Load a peer. Throws if the peer cannot be loaded.
   */
  get: (id: string) => Promise<Peer>

  /**
   * Add a peer based on the provided config
   */
  add: (peer: PeerInfo) => Promise<void>

  /**
   * Update a peer
   */
  update: (peer: PeerInfo) => Promise<Peer>

  /**
   * Remove a peer
   */
  remove: (peerId: string) => Promise<void>

  // TODO: Should this be an iterator
  list: () => Promise<PeerInfo[]>
}

export * from './in-memory'
