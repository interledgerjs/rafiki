import { createHash } from 'crypto'
import { isFulfill, Errors } from 'ilp-packet'
import { Rule } from '../types/rule'
import { log } from '../winston'
import { AppServices } from '../services'
const logger = log.child({ component: 'validate-fulfillment-rule' })
const { WrongConditionError } = Errors

export class ValidateFulfillmentRule extends Rule {

  constructor (services: AppServices) {
    super(services, {
      outgoing: async ({ state: { ilp, peers } }, next) => {
        const { executionCondition } = ilp.req
        await next()
        if (ilp.res && isFulfill(ilp.res)) {
          const { fulfillment } = ilp.res
          const calculatedCondition = createHash('sha256').update(fulfillment).digest()
          if (!calculatedCondition.equals(executionCondition)) {
            logger.warn('invalid fulfillment', { ilp })
            throw new WrongConditionError('fulfillment did not match expected value.')
          }
        }
      }
    })
  }
}
