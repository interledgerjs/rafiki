import { Errors } from 'ilp-packet'
import { Rule } from '../types/rule'
import { log } from '../logger'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'expire' })

const { TransferTimedOutError } = Errors

/**
 * This middleware should be at the end of the outgoing pipeline to ensure
 * the whole pipeline process the reject that is generated when a prepare expires
 */
export function createOutgoingExpireMiddleware () {
  return async ({ ilp }: RafikiContext, next: () => Promise<any>) => {
    const { expiresAt } = ilp.outgoingPrepare
    const duration = expiresAt.getTime() - Date.now()
    const timeout = setTimeout(() => {
      logger.debug('packet expired', { ilp })
      throw new TransferTimedOutError('packet expired.')
    }, duration)
    await next()
    clearTimeout(timeout)
  }
}