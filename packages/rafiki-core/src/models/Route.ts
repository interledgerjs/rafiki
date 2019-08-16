import { Pojo, Model } from 'objection'

export class Route extends Model {

  static get tableName () {
    return 'routes'
  }

  id!: number
  peerId!: string
  targetPrefix!: string

  $formatJson (): Pojo {
    return {
      id: this.id,
      peerId: this.peerId,
      targetPrefix: this.targetPrefix
    }
  }

  static get jsonSchema () {
    return {
      'description': "Preconfigured routes to add to the connector's routing table.",
      'type': 'object',
      'default': {},
      'items': {
        'description': 'Description of a route entry.',
        'type': 'object',
        'properties': {
          'targetPrefix': {
            'description': 'ILP address prefix that this route applies to. Configured routes take precedence over the same or shorter prefixes that are local or published by peers. More specific prefixes will still take precedence. Prefixes should NOT include a trailing period.',
            'type': 'string',
            'pattern': '^[a-zA-Z0-9._~-]+$'
          },
          'peerId': {
            'description': 'ID of the account that destinations matching `targetPrefix` should be forwarded to. Must be one of the peers in `peers`.',
            'type': 'string',
            'pattern': '^[a-zA-Z0-9._~-]+$'
          }
        },
        'required': ['targetPrefix', 'peerId'],
        'additionalProperties': false
      }
    }
  }
}
