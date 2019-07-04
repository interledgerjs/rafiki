import { Pojo, Model } from 'objection'
import { Rule } from './Rule'
import { Protocol } from './Protocol'
import { Endpoint } from './Endpoint'

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

  $formatJson (): Pojo {
    return {
      id: this.id,
      assetScale: this.assetScale,
      assetCode: this.assetCode,
      relation: this.relation
    }
  }
}
