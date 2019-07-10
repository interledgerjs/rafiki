import { Pojo, Model } from 'objection'
import { Rule } from './Rule'
import { Protocol } from './Protocol'
import { Endpoint } from './Endpoint'
import Knex from 'knex'
import { PeerInfo } from '../types'
import { EndpointInfo } from '../endpoints'

export class Peer extends Model {

  static get tableName () {
    return 'peers'
  }

  id!: string
  assetCode!: string
  assetScale!: number
  relation!: string

  static relationMappings = {
    rules: {
      relation: Model.HasManyRelation,
      modelClass: Rule,
      join: {
        from: 'peers.id',
        to: 'rules.peerId'
      }
    },
    protocols: {
      relation: Model.HasManyRelation,
      modelClass: Protocol,
      join: {
        from: 'peers.id',
        to: 'protocols.peerId'
      }
    },
    endpoint: {
      relation: Model.HasOneRelation,
      modelClass: Endpoint,
      join: {
        from: 'peers.id',
        to: 'endpoints.peerId'
      }
    }
  }

  static async deleteByIdWithRelations (peerId: string, knex: Knex) {
    const peer = await Peer.query(knex).where('id', peerId).first()
    if (peer) {
      await peer.$relatedQuery('rules', knex).delete()
      await peer.$relatedQuery('protocols', knex).delete()
      await peer.$relatedQuery('endpoint', knex).delete()
      await peer.$query(knex).delete()
    }
  }

  static async insertFromInfo (peerInfo: PeerInfo, endpointInfo: EndpointInfo, knex: Knex) {
    const peer = await Peer.query(knex).insertAndFetch({ ...peerInfo })
    peerInfo.rules.forEach(async (rule) => peer.$relatedQuery<Rule>('rules', knex).insert({ name: rule.name, config: rule }))
    peerInfo.protocols.forEach(async (protocol) => peer.$relatedQuery<Protocol>('protocols', knex).insert({ name: protocol.name, config: protocol }))
    await peer.$relatedQuery<Endpoint>('endpoint', knex).insert({ type: endpointInfo.type, options: endpointInfo.type === 'http' ? endpointInfo.httpOpts : endpointInfo.pluginOpts })
  }

  $formatJson (): Pojo {
    return {
      id: this.id,
      assetScale: this.assetScale,
      assetCode: this.assetCode,
      relation: this.relation
    }
  }
}
