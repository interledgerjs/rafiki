import { Peer, PeerService } from '.'
import { PeerInfo, Balance, InMemoryBalance, PeerRelation, BalanceConfig, ClientConfig } from '../../types'
import { Client } from '../client'
import { AxiosClient } from '../client/axios'
import { Peer as PeerModel } from '../../models/Peer'
import { Rule } from '../../models/Rule'
import { Protocol } from '../../models/Protocol'
import Knex from 'knex'
import { Subject } from 'rxjs'
import { PeerNotFoundError } from '../../errors/peer-not-found-error'
import { MIN_INT_64, MAX_INT_64 } from '../../constants'

export class InMemoryPeer implements Peer {
  _client: Promise<Client>
  _balance: Promise<Balance>
  constructor (private _peer: PeerInfo) {
    // TODO: Need to make this immutable
    if (_peer.client.url) {
      const axiosConfig = { responseType: 'arraybuffer', headers: {} }
      if (_peer.client.authToken) axiosConfig.headers = { 'Authorization': `Bearer ${_peer.client.authToken}` }
      this._client = Promise.resolve(new AxiosClient(_peer.client.url, axiosConfig))
    }
    this._balance = Promise.resolve(new InMemoryBalance(_peer.balance.initialBalance))
  }

  get info (): PeerInfo {
    return this._peer
  }
  get balance (): Promise<Balance> {
    return this._balance
  }
  get client (): Promise<Client> {
    if (this._client) return this._client
    throw new Error('no client for peer ' + this._peer.id)
  }

}

export class InMemoryPeers implements PeerService {

  private _addedPeers: Subject<PeerInfo>
  private _updatedPeers: Subject<PeerInfo>
  private _removedPeers: Subject<PeerInfo>
  private _peers = new Map<string, InMemoryPeer>()

  constructor () {
    this._addedPeers = new Subject<PeerInfo>()
    this._updatedPeers = new Subject<PeerInfo>()
    this._removedPeers = new Subject<PeerInfo>()
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

  public async getOrThrow (id: string): Promise<Peer> {
    const peer = this._peers.get(id)
    if (!peer) throw new PeerNotFoundError(id)
    return peer
  }

  async add (peer: PeerInfo) {
    this._peers.set(peer.id, new InMemoryPeer(peer))
    this._addedPeers.next(peer)
  }

  // Tricky as we need to manage state of in memory peer potentially
  // TODO work out what needs to be managed
  async update (peer: PeerInfo) {
    const oldPeer = this._peers.get(peer.id)
    if (!oldPeer) {
      throw new PeerNotFoundError(peer.id)
    }
    const newPeer = new InMemoryPeer(peer)
    this._peers.set(peer.id, newPeer)
    this._updatedPeers.next(peer)
    return newPeer
  }

  async remove (peerId: string) {
    const oldPeer = this._peers.get(peerId)
    if (!oldPeer) {
      throw new PeerNotFoundError(peerId)
    }
    this._peers.delete(peerId)
    this._removedPeers.next(oldPeer.info)
  }

  async list () {
    return [...this._peers.values()].map(peer => peer.info)
  }

  public async load (knex: Knex) {
    const result = await PeerModel.query(knex).eager('[rules,protocols,endpoint]')
    return Promise.all(result.map(async peer => {

      const rules = {}
      peer['rules'].map((rule: Rule) => {
        rules[rule.name] = rule.config || {}
      })

      const protocols = {}
      peer['protocols'].map((protocol: Protocol) => {
        protocols[protocol.name] = protocol.config || {}
      })

      // TODO: Load balance and client info
      const balance: BalanceConfig = {
        initialBalance: 0n,
        maximum: MAX_INT_64,
        minimum: MIN_INT_64
      }

      const client: ClientConfig = {
      }

      return this.add({
        id: peer.id,
        assetCode: peer.assetCode,
        assetScale: peer.assetScale,
        relation: peer.relation as PeerRelation,
        balance,
        client,
        rules,
        protocols
      })
    }))
  }
}
