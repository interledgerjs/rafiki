// import { Pojo, Model } from 'objection'
//
// export class Protocol extends Model {
//
//   static get tableName () {
//     return 'protocols'
//   }
//
//   id!: number
//   peerId!: string
//   name!: string
//   config!: Pojo
//
//   static get jsonSchema () {
//     return {
//       type: 'object',
//       properties: {
//         id: { type: 'integer' },
//         peerId: { type: 'string' },
//         name: { type: 'string' },
//         config: {
//           type: 'object'
//         }
//       }
//     }
//   }
//
//   $formatJson (): Pojo {
//     return {
//       id: this.id,
//       name: this.name,
//       peerId: this.peerId,
//       config: this.config
//     }
//   }
// }
