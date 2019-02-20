// import { create as createLogger } from '../common/log'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { IlpPrepare, IlpReply, errorToIlpReject, isFulfill, isReject } from 'ilp-packet'

export interface ErrorHandlerMiddlewareServices {
  getOwnIlpAddress: () => string
}

/**
 * Catch errors that bubble back along the pipeline and convert to an ILP Reject
 *
 * Important middleware. It ensures any errors thrown through the middleware pipe is converted to correct ILP
 * reject that is sent back to sender.
 */
export class ErrorHandlerMiddleware extends Middleware {
  private getOwnIlpAddress: () => string

  constructor ({ getOwnIlpAddress }: ErrorHandlerMiddlewareServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler, sendCallback?: () => void): Promise<IlpReply> => {
        try {
          const response = await next(request)

          if (!(isFulfill(response) || isReject(response))) {
            throw new Error('handler did not return a value.')
          }

          return response
        } catch (e) {
          let err = e
          if (!err || typeof err !== 'object') {
            err = new Error('Non-object thrown: ' + e)
          }
          return errorToIlpReject(this.getOwnIlpAddress(), err)
        }
      }
    })
    this.getOwnIlpAddress = getOwnIlpAddress
  }

}
