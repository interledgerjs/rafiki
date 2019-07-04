import { Pojo, Model } from 'objection'

export class Protocol extends Model {

  static get tableName () {
    return 'protocols'
  }

  id!: number
  name!: string

  $formatJson (): Pojo {
    return {
      id: this.id,
      name: this.name
    }
  }
}
