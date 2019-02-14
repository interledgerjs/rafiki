import Middleware, { MiddlewareCallback, Pipelines, MiddlewareServices } from '../../types/middleware'
import { IlpPrepare, Errors as IlpPacketErrors, IlpReply, isFulfill, IlpFulfill } from 'ilp-packet'
import { CCP_CONTROL_DESTINATION, CCP_UPDATE_DESTINATION } from 'ilp-protocol-ccp'
// import { create as createLogger } from '../common/log'
// const log = createLogger('alert-middleware')

export interface CcpMiddlewareServices extends MiddlewareServices {
  handleCcpRouteControl: (routeControlPacket: IlpPrepare) => Promise<IlpReply>,
  handleCcpRouteUpdate: (packet: IlpPrepare) => Promise<IlpReply>,
}

export default class CcpMiddleware implements Middleware {

  handleCcpRouteControl: (routeControlPacket: IlpPrepare) => Promise<IlpReply>
  handleCcpRouteUpdate: (packet: IlpPrepare) => Promise<IlpReply>

  constructor ({ handleCcpRouteControl, handleCcpRouteUpdate }: CcpMiddlewareServices) {
    this.handleCcpRouteControl = handleCcpRouteControl
    this.handleCcpRouteUpdate = handleCcpRouteUpdate
  }

  async applyToPipelines (pipelines: Pipelines) {
    pipelines.incomingData.insertLast({
      name: 'ccp',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        switch (packet.destination) {
          case CCP_CONTROL_DESTINATION:
            return this.handleCcpRouteControl(packet)
          case CCP_UPDATE_DESTINATION:
            return this.handleCcpRouteUpdate(packet)
          default:
            return next(packet)
        }
      }
    })
  }
}
