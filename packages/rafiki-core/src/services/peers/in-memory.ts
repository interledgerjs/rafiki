import { Peer, PeerService } from '.'
import { PeerInfo, PeerRelation } from '../../types'
import { AxiosClient } from '../client/axios'
import { Peer as PeerModel } from '../../models/Peer'
import Knex from 'knex'
import { Subject } from 'rxjs'
import { PeerNotFoundError } from '../../errors'
import { log } from '../../logger'

class InMemoryPeer implements Peer {
  readonly [key: string]: any
  id: string
  url?: string
  relation: PeerRelation
  relationWeight?: number
  authToken?: string
  isCcpSender: boolean
  isCcpReceiver: boolean
  defaultAccountId: string

  static logger = log.child({ component: 'in-memory-peer' })
  constructor (info: PeerInfo) {
    Object.assign(this, info)
  }

  public send (data: Buffer) {
    if (!this.url) throw new Error('No URL configured for peer')

    // TODO: Connection pooling and keep-alive
    const axiosConfig = { responseType: 'arraybuffer', headers: {} }
    if (this.authToken) axiosConfig.headers = { 'Authorization': `Bearer ${this.authToken}` }
    const client = new AxiosClient(this.url, axiosConfig)

    return client.send(data)
  }

}

export class InMemoryPeers implements PeerService {

  static logger = log.child({ component: 'in-memory-peers-service' })

  private _addedPeers: Subject<Peer>
  private _updatedPeers: Subject<Peer>
  private _removedPeers: Subject<string>
  private _peers = new Map<string, InMemoryPeer>()

  constructor () {
    this._addedPeers = new Subject<Peer>()
    this._updatedPeers = new Subject<Peer>()
    this._removedPeers = new Subject<string>()
  }

  get added () {
    return this._addedPeers.asObservable()
  }

  get updated () {
    return this._updatedPeers.asObservable()
  }

  get deleted () {
    return this._removedPeers.asObservable()
  }

  public async get (id: string): Promise<Peer> {
    const peer = this._peers.get(id)
    if (!peer) throw new PeerNotFoundError(id)
    return peer
  }

  async add (peerInfo: Readonly<PeerInfo>) {
    const peer = new InMemoryPeer(peerInfo)
    this._peers.set(peer.id, peer)
    this._addedPeers.next(peer)
    return peer
  }

  async update (peerInfo: Readonly<PeerInfo>) {
    let peer = this._peers.get(peerInfo.id)
    if (!peer) {
      throw new PeerNotFoundError(peerInfo.id)
    }
    peer = new InMemoryPeer(peerInfo)
    this._peers.set(peerInfo.id, peer)
    this._updatedPeers.next(peer)
    return peer
  }

  async remove (peerId: string) {
    const oldPeer = this._peers.get(peerId)
    if (!oldPeer) {
      throw new PeerNotFoundError(peerId)
    }
    this._peers.delete(peerId)
    this._removedPeers.next(peerId)
  }

  async list () {
    return [...this._peers.values()].map(peer => peer.info)
  }

  public async load (knex: Knex) {
    const result = await PeerModel.query(knex).eager('[rules,protocols,endpoint]')
    return Promise.all(result.map(async peer => {

      // TODO: Fix Knex loader
      return this.add({
        id: peer.id,
        isCcpReceiver: false,
        isCcpSender: false,
        relation: peer.relation as PeerRelation,
        defaultAccountId: peer.id // BIG ASSUMPTION HERE
      })
    }))
  }
}
