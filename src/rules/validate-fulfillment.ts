import { createHash } from 'crypto'
import { isFulfill, IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Rule, IlpRequestHandler } from '../types/rule'
import { log } from '../winston'
const logger = log.child({ component: 'validate-fulfillment-rule' })
const { WrongConditionError } = Errors

export class ValidateFulfillmentRule extends Rule {

  constructor () {
    super({
      outgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        const { executionCondition } = request
        const reply = await next(request)
        if (isFulfill(reply)) {
          const { fulfillment } = reply
          const calculatedCondition = createHash('sha256').update(fulfillment).digest()
          if (!calculatedCondition.equals(executionCondition)) {
            logger.warn('invalid fulfillment', { request, reply })
            throw new WrongConditionError('fulfillment did not match expected value.')
          }
        }
        return reply
      }
    })
  }
}
