import { createHash } from 'crypto'
import { isFulfill, Errors } from 'ilp-packet'
import { log } from '../winston'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'validate-fulfillment' })
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
