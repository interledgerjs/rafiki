import { createHash } from 'crypto'
import { RafikiContext } from '@interledger/rafiki-core'
import { log } from '@interledger/rafiki-utils'
const logger = log.child({ middleware: 'validate-fulfillment' })
import { Errors } from 'ilp-packet'

const { WrongConditionError } = Errors

export function createOutgoingValidateFulfillmentMiddleware () {
  return async ({ ilp, state }: RafikiContext, next: () => Promise<any>) => {
    const { executionCondition } = ilp.prepare
    await next()
    if (ilp.fulfill) {
      const { fulfillment } = ilp.fulfill
      const calculatedCondition = createHash('sha256').update(fulfillment).digest()
      if (!calculatedCondition.equals(executionCondition)) {
        logger.warn('invalid fulfillment', { ilp })
        throw new WrongConditionError('fulfillment did not match expected value.')
      }
    }
  }
}
