import { Rule } from '../types/rule'
import { errorToIlpReject, isFulfill, isReject } from 'ilp-packet'
import { log } from '../winston'
import { AppServices } from '../services'
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

  constructor (services: AppServices, { getOwnIlpAddress }: ErrorHandlerRuleServices) {
    super(services, {
      incoming: async ({ state: { peers, ilp } }, next) => {
        try {
          await next()
          if (ilp.res && !(isFulfill(ilp.res) || isReject(ilp.res))) {
            logger.error('handler did not return a valid value.', { response: JSON.stringify(ilp.res) })
            throw new Error('handler did not return a value.')
          }
        } catch (e) {
          let err = e
          if (!err || typeof err !== 'object') {
            err = new Error('Non-object thrown: ' + e)
          }
          logger.error('Error thrown in incoming pipeline', { err })
          ilp.res = errorToIlpReject(getOwnIlpAddress(), err)
        }
      }
    })
  }

}
