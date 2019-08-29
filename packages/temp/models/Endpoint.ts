// import { Pojo, Model } from 'objection'
//
// export class Endpoint extends Model {
//
//   static get tableName () {
//     return 'endpoints'
//   }
//
//   id!: number
//   type!: string
//   options!: Pojo
//
//   static get jsonSchema () {
//     return {
//       type: 'object',
//       properties: {
//         id: { type: 'integer' },
//         type: { type: 'string' },
//         options: {
//           type: 'object'
//         }
//       }
//     }
//   }
//
//   $formatJson (): Pojo {
//     return {
//       id: this.id,
//       type: this.type
//     }
//   }
// }
