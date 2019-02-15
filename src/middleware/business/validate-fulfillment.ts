import { createHash } from 'crypto'
// import { create as createLogger } from '../common/log' //TODO add back logging
// const log = createLogger('validate-fulfillment-middleware')
import { isFulfill, IlpPrepare, IlpReply, IlpFulfill, Errors } from 'ilp-packet'
import Middleware, { MiddlewareCallback, Pipelines } from '../../types/middleware'
const { WrongConditionError } = Errors

export default class ValidateFulfillmentMiddleware implements Middleware {
  async applyToPipelines (pipelines: Pipelines) {
    pipelines.outgoingData.insertLast({
      name: 'validateFulfillment',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        const { executionCondition } = packet

        const reply = await next(packet)

        if (isFulfill(reply)) {
          console.log('falala')
          const { fulfillment } = reply
          const calculatedCondition = createHash('sha256').update(fulfillment).digest()

          if (!calculatedCondition.equals(executionCondition)) {
              // TODO add back logging
              // log.error('received incorrect fulfillment from account. accountId=%s fulfillment=%s calculatedCondition=%s executionCondition=%s', accountId, fulfillment.toString('base64'), calculatedCondition.toString('base64'), executionCondition.toString('base64'))
            console.log('received incorrect fulfillment from account. accountId=%s fulfillment=%s calculatedCondition=%s executionCondition=%s', 'test', fulfillment.toString('base64'), calculatedCondition.toString('base64'), executionCondition.toString('base64'))
            throw new WrongConditionError('fulfillment did not match expected value.')
          }
        }

        return reply
      }
    })
  }
}
