import { Rule, IlpRequestHandler } from '../types/rule'
import { IlpPrepare, IlpReply, errorToIlpReject, isFulfill, isReject } from 'ilp-packet'
import { log } from '../winston'
const logger = log.child({ component: 'error-handler-rule' })

export interface ErrorHandlerRuleServices {
  getOwnIlpAddress: () => string
}

/**
 * Catch errors that bubble back along the pipeline and convert to an ILP Reject
 *
 * Important rule! It ensures any errors thrown through the middleware pipe is converted to correct ILP
 * reject that is sent back to sender.
 */
export class ErrorHandlerRule extends Rule {

  constructor ({ getOwnIlpAddress }: ErrorHandlerRuleServices) {
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
