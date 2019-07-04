import { Pojo, Model } from 'objection'

export class Rule extends Model {

  static get tableName () {
    return 'rules'
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
