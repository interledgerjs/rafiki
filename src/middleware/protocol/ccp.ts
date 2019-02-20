import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import { CCP_CONTROL_DESTINATION, CCP_UPDATE_DESTINATION } from 'ilp-protocol-ccp'

export interface CcpMiddlewareServices {
  handleCcpRouteControl: IlpRequestHandler,
  handleCcpRouteUpdate: IlpRequestHandler,
}

export class CcpMiddleware extends Middleware {

  constructor ({ handleCcpRouteControl, handleCcpRouteUpdate }: CcpMiddlewareServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        switch (request.destination) {
          case CCP_CONTROL_DESTINATION:
            return handleCcpRouteControl(request)
          case CCP_UPDATE_DESTINATION:
            return handleCcpRouteUpdate(request)
          default:
            return next(request)
        }
      }
    })
  }
}
