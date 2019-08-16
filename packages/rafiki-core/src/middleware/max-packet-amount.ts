import { Errors } from 'ilp-packet'
import { log } from '../logger'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'max-packet-amount' })
const { AmountTooLargeError } = Errors

/**
 * @throws {AmountTooLargeError} Throws if the request amount is greater than the prescribed max packet amount.
 */
export function createIncomingMaxPacketAmountMiddleware () {
  return async ({ ilp, state: { peers } }: RafikiContext, next: () => Promise<any>) => {
    const { maxPacketAmount } = await peers.incoming
    if (maxPacketAmount) {
      const amount = BigInt(ilp.prepare.amount)
      if (amount > maxPacketAmount) {
        logger.warn('rejected a packet due to amount exceeding maxPacketAmount', { maxPacketAmount, ilp })
        throw new AmountTooLargeError(`packet size too large. maxAmount=${maxPacketAmount} actualAmount=${ilp.prepare.amount}`, {
          receivedAmount: ilp.prepare.amount,
          maximumAmount: maxPacketAmount.toString()
        })
      }
    }
    await next()
  }
}
