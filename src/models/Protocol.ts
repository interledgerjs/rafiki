import { Pojo, Model } from 'objection'

export class Protocol extends Model {

  static get tableName () {
    return 'protocols'
  }

  id!: number
  peerId!: string
  name!: string
  config!: string

  $formatJson (): Pojo {
    return {
      id: this.id,
      name: this.name,
      peerId: this.peerId,
      config: this.config
    }
  }
}
