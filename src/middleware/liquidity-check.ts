import { log } from '../winston'
import { Errors as IlpPacketErrors, isReject } from 'ilp-packet'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'liquidity-check' })
const { T04_INSUFFICIENT_LIQUIDITY } = IlpPacketErrors.codes

/**
 * Log error for reject packets caused by insufficient liquidity or an exceeded maximum balance.
 */
export function createOutgoingLiquidityCheckMiddleware () {
  return async ({ ilp, state: { peers } }: RafikiContext, next: () => Promise<any>) => {

    await next()

    if (ilp.reject) {
      if (ilp.reject.code !== T04_INSUFFICIENT_LIQUIDITY) return

      // The peer rejected a packet which, according to the local balance, should
      // have succeeded. This can happen when our local connector owes the peer
      // money but restarted before it was settled.
      if (ilp.reject.message !== 'exceeded maximum balance.') return

      logger.error('Liquidity Check Error', {
        peerId: (await peers.outgoing).info.id,
        triggerBy: ilp.reject.triggeredBy,
        message: ilp.reject.message
      })
    }
  }
}
