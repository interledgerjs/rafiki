import { createHash } from 'crypto'
import { RafikiContext, RafikiMiddleware } from '@interledger/rafiki-core'
import { Errors } from 'ilp-packet'

const { WrongConditionError } = Errors

export function createOutgoingValidateFulfillmentMiddleware (): RafikiMiddleware {
  return async ({ log, request: { prepare }, response }: RafikiContext, next: () => Promise<any>) => {
    const { executionCondition } = prepare
    await next()
    if (response.fulfill) {
      const { fulfillment } = response.fulfill
      const calculatedCondition = createHash('sha256').update(fulfillment).digest()
      if (!calculatedCondition.equals(executionCondition)) {
        log.warn('invalid fulfillment', { response })
        throw new WrongConditionError('fulfillment did not match expected value.')
      }
    }
  }
}
