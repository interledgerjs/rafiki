import { createHash } from 'crypto'
import { isFulfill, IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { log } from '../../winston'
const logger = log.child({ component: 'validate-fulfillment-middleware' })
const { WrongConditionError } = Errors

export class ValidateFulfillmentMiddleware extends Middleware {

  constructor () {
    super({
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
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
