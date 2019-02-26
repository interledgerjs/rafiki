import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { IlpPrepare, IlpReply, errorToIlpReject, isFulfill, isReject } from 'ilp-packet'
import { log } from '../../winston'
const logger = log.child({ component: 'error-handler-middleware' })

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

  constructor ({ getOwnIlpAddress }: ErrorHandlerMiddlewareServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
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
          logger.error('Error thrown in incoming pipeline', { err })
          return errorToIlpReject(getOwnIlpAddress(), err)
        }
      }
    })
  }

}
