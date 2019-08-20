import { Errors } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '@interledger/rafiki-core'
const { AmountTooLargeError } = Errors

/**
 * @throws {AmountTooLargeError} Throws if the request amount is greater than the prescribed max packet amount.
 */
export function createIncomingMaxPacketAmountMiddleware (): RafikiMiddleware {
  return async ({ log, request, peers }: RafikiContext, next: () => Promise<any>) => {
    const { maxPacketAmount } = await peers.incoming
    if (maxPacketAmount) {
      const amount = request.prepare.intAmount
      if (amount > maxPacketAmount) {
        log.warn('rejected a packet due to amount exceeding maxPacketAmount', { maxPacketAmount, request })
        throw new AmountTooLargeError(`packet size too large. maxAmount=${maxPacketAmount} actualAmount=${request.prepare.amount}`, {
          receivedAmount: request.prepare.amount,
          maximumAmount: maxPacketAmount.toString()
        })
      }
    }
    await next()
  }
}
