// import Middleware, { MiddlewareCallback, Pipelines, MiddlewareServices } from '../../types/middleware'
// import { IlpPrepare, Errors as IlpPacketErrors, IlpReply, isFulfill, IlpFulfill } from 'ilp-packet'
// import { CCP_CONTROL_DESTINATION, CCP_UPDATE_DESTINATION } from 'ilp-protocol-ccp'
// // import { create as createLogger } from '../common/log'
// // const log = createLogger('alert-middleware')

// // TODO: Waiting to flesh out the rest of the new connector to see how this will fit in.

// export interface EchoMiddlewareService extends MiddlewareServices {
// }

// export default class EchoMiddleware implements Middleware {
//   async applyToPipelines (pipelines: Pipelines) {
//     pipelines.incomingData.insertLast({
//       name: 'echo',
//       method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
//         return next(packet)
//       }
//     })
//   }
// }
