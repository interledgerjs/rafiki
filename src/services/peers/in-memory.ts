import { Peer, PeerService } from '.'
import { ServiceBase } from '..'
import { PeerInfo, Balance, InMemoryBalance, PeerRelation } from '../../types'
import { Client } from '../client'
import { AxiosClient } from '../client/axios'
import { Peer as PeerModel } from '../../models/Peer'
import { Rule } from '../../models/Rule'
import { Protocol } from '../../models/Protocol'
import Knex from 'knex'

export class InMemoryPeer implements Peer {
  _client: Client
  _balance: Balance
  constructor (private _peer: PeerInfo) {
    if (_peer.client) {
      const axiosConfig = { responseType: 'arraybuffer', headers: {} }
      if (_peer.client.authToken) axiosConfig.headers = { 'Authorization': `Bearer ${_peer.client.authToken}` }
      this._client = new AxiosClient(_peer.client.url, axiosConfig)
    }
    if (_peer.balance) {
      this._balance = new InMemoryBalance(_peer.balance)
    }
  }

  get info (): PeerInfo {
    return this._peer
  }
  get client (): Client {
    return this._client
  }
  get balance (): Balance {
    return this._balance
  }

}

export class InMemoryPeers extends ServiceBase<Peer> implements PeerService {

  public async load (knex: Knex) {
    const result = await PeerModel.query(knex).eager('[rules,protocols,endpoint]')
    result.forEach(peer => {
      const rules = {}
      peer['rules'].map((rule: Rule) => {
        rules[rule.name] = rule.config || {}
      })
      const protocols = {}
      peer['protocols'].map((protocol: Protocol) => {
        protocols[protocol.name] = protocol.config || {}
      })
      this.set(peer.id, new InMemoryPeer({
        id: peer.id,
        assetCode: peer.assetCode,
        assetScale: peer.assetScale,
        relation: peer.relation as PeerRelation,
        rules,
        protocols
      }))
    })
  }
}
