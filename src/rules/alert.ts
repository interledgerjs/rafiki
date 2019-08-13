import { log } from '../winston'
import { Errors as IlpPacketErrors, isReject } from 'ilp-packet'
import { Rule } from '../types/rule'
import { AppServices } from '../services'
const logger = log.child({ component: 'alert-rule' })
const { T04_INSUFFICIENT_LIQUIDITY } = IlpPacketErrors.codes

/**
 * Creates alerts for reject packets caused by insufficient liquidity or an exceeded maximum balance.
 */
export class AlertRule extends Rule {
  constructor (services: AppServices) {
    super(services, {

      outgoing: async ({ state: { ilp, peers } }, next) => {

        await next()

        if (ilp.res && isReject(ilp.res)) {
          if (ilp.res.code !== T04_INSUFFICIENT_LIQUIDITY) return

          // The peer rejected a packet which, according to the local balance, should
          // have succeeded. This can happen when our local connector owes the peer
          // money but restarted before it was settled.
          if (ilp.res.message !== 'exceeded maximum balance.') return

          this._services.alerts.createAlert(peers.outgoing.id, ilp.res.triggeredBy, ilp.res.message)
        }

      }
    })
  }
}
