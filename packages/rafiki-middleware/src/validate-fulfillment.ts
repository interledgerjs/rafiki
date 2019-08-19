import { createHash } from 'crypto'
import { RafikiContext } from '@interledger/rafiki-core'
import { Errors } from 'ilp-packet'

const { WrongConditionError } = Errors

export function createOutgoingValidateFulfillmentMiddleware () {
  return async ({ log, ilp, state }: RafikiContext, next: () => Promise<any>) => {
    const { executionCondition } = ilp.prepare
    await next()
    if (ilp.fulfill) {
      const { fulfillment } = ilp.fulfill
      const calculatedCondition = createHash('sha256').update(fulfillment).digest()
      if (!calculatedCondition.equals(executionCondition)) {
        log.warn('invalid fulfillment', { ilp })
        throw new WrongConditionError('fulfillment did not match expected value.')
      }
    }
  }
}
