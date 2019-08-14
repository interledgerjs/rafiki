import { Errors, isPrepare } from 'ilp-packet'
import { Rule } from '../types/rule'
import { log } from '../winston'
const logger = log.child({ component: 'expire-rule' })

const { AmountTooLargeError } = Errors

export interface MaxPacketAmountRuleService {
  maxPacketAmount?: bigint,
}

/**
 * @throws {AmountTooLargeError} Throws if the request amount is greater than the prescribed max packet amount.
 */
export class MaxPacketAmountRule extends Rule {
  constructor () {
    super({
      incoming: async ({ state: { ilp, peers } }, next) => {
        const { maxPacketAmount } = peers.incoming.info.rules
        if (maxPacketAmount.maxPacketAmount && isPrepare(ilp.req)) {
          const amount = BigInt(ilp.req.amount)
          if (amount > maxPacketAmount.maxPacketAmount) {
            logger.warn('rejected a packet due to amount exceeding maxPacketAmount', { maxPacketAmount, ilp })
            throw new AmountTooLargeError(`packet size too large. maxAmount=${maxPacketAmount} actualAmount=${ilp.req.amount}`, {
              receivedAmount: ilp.req.amount,
              maximumAmount: maxPacketAmount.toString()
            })
          }
        }
        await next()
      }
    })
  }
}
