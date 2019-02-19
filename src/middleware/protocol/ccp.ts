import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import { CCP_CONTROL_DESTINATION, CCP_UPDATE_DESTINATION } from 'ilp-protocol-ccp'

export interface CcpMiddlewareServices {
  handleCcpRouteControl: (request: IlpPrepare) => Promise<IlpReply>,
  handleCcpRouteUpdate: (request: IlpPrepare) => Promise<IlpReply>,
}

export class CcpMiddleware extends Middleware {

  constructor ({ handleCcpRouteControl, handleCcpRouteUpdate }: CcpMiddlewareServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler, sendCallback?: () => void): Promise<IlpReply> => {
        switch (request.destination) {
          case CCP_CONTROL_DESTINATION:
            if (sendCallback) sendCallback()
            return handleCcpRouteControl(request)
          case CCP_UPDATE_DESTINATION:
            if (sendCallback) sendCallback()
            return handleCcpRouteUpdate(request)
          default:
            return next(request, sendCallback)
        }
      }
    })
  }
}
