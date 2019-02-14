// import { create as createLogger } from '../common/log'
import Middleware, { MiddlewareCallback, MiddlewareServices, Pipelines } from '../../types/middleware'
import { IlpPrepare, IlpReply, errorToIlpReject, isFulfill, isReject } from 'ilp-packet'

export interface ErrorHandlerMiddlewareServices extends MiddlewareServices {
  getOwnIlpAddress: () => string
}

export default class ErrorHandlerMiddleware implements Middleware {
  private getOwnIlpAddress: () => string

  constructor ({ getOwnIlpAddress }: ErrorHandlerMiddlewareServices) {
    this.getOwnIlpAddress = getOwnIlpAddress
  }

  async applyToPipelines (pipelines: Pipelines) {
    // const log = createLogger(`error-handler-middleware[${accountId}]`)

    /**
     * Important middleware. It ensures any errors thrown through the middleware pipe is converted to correct ILP
     * reject that is sent back to sender.
     */
    pipelines.incomingData.insertLast({
      name: 'errorHandler',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        try {
          const response = await next(packet)

          if (!(isFulfill(response) || isReject(response))) {
            throw new Error('handler did not return a value.')
          }

          return response
        } catch (e) {
          let err = e
          if (!err || typeof err !== 'object') {
            err = new Error('Non-object thrown: ' + e)
          }

          // log.debug('error in data handler, creating rejection. ilpErrorCode=%s error=%s', err.ilpErrorCode, err.stack ? err.stack : err)

          return errorToIlpReject(this.getOwnIlpAddress(), err)
        }
      }
    })
  }
}
