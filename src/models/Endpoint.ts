import { Pojo, Model } from 'objection'
import { object } from 'joi';

export class Endpoint extends Model {

  static get tableName () {
    return 'endpoints'
  }

  id!: number
  type!: string
  options!: any

  static get jsonSchema () {
    return {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        type: { type: 'string' },
        options: {
          type: 'object'
        }
      }
    }
  }

  $formatJson (): Pojo {
    return {
      id: this.id,
      type: this.type
    }
  }
}
