import { createHash } from 'crypto'
import { isFulfill, IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
const { WrongConditionError } = Errors

export class ValidateFulfillmentMiddleware extends Middleware {

  constructor () {
    super({
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler, sendCallback?: () => void): Promise<IlpReply> => {
        const { executionCondition } = request
        const reply = await next(request, sendCallback)
        if (isFulfill(reply)) {
          const { fulfillment } = reply
          const calculatedCondition = createHash('sha256').update(fulfillment).digest()
          if (!calculatedCondition.equals(executionCondition)) {
            throw new WrongConditionError('fulfillment did not match expected value.')
          }
        }
        return reply
      }
    })
  }
}
