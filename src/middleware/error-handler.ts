import { errorToIlpReject, isFulfill, isReject } from 'ilp-packet'
import { log } from '../winston'
import { SELF_PEER_ID } from '../constants'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'error-handler' })

/**
 * Catch errors that bubble back along the pipeline and convert to an ILP Reject
 *
 * Important rule! It ensures any errors thrown through the middleware pipe is converted to correct ILP
 * reject that is sent back to sender.
 */
export function createIncomingErrorHandlerMiddleware () {
  return async ({ ilp, services }: RafikiContext, next: () => Promise<any>) => {
    try {
      await next()
      if (!ilp.reply) {
        logger.error('handler did not return a valid value.')
        throw new Error('handler did not return a value.')
      }
    } catch (e) {
      let err = e
      if (!err || typeof err !== 'object') {
        err = new Error('Non-object thrown: ' + e)
      }
      logger.error('Error thrown in incoming pipeline', { err })
      const self = services.router.getAddresses(SELF_PEER_ID)
      ilp.respond(errorToIlpReject(self.length > 0 ? self[0] : 'peer', err))
    }
  }
}
