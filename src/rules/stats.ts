import { isFulfill, IlpReject } from 'ilp-packet'
import { Rule } from '../types/rule'

/**
 * The stats rule tracks the number of fulfilled/rejected/failed to send packets on the incoming and outgoing pipelines.
 */
export class StatsRule extends Rule {
  constructor () {
    super({
      incoming: async ({ state: { ilp, peers } }, next) => {
        try {
          await next()
          if (ilp.res && isFulfill(ilp.res)) {
            this._services.stats.incomingDataPackets.increment(peers.incoming, { result: 'fulfilled' })
          } else {
            this._services.stats.incomingDataPackets.increment(peers.incoming, { result: 'rejected' })
          }
        } catch (err) {
          this._services.stats.incomingDataPackets.increment(peers.incoming, { result: 'failed' })
          throw err
        }
      },
      outgoing: async ({ state: { ilp, peers } }, next) => {
        try {
          await next()
          if (ilp.res && isFulfill(ilp.res)) {
            this._services.stats.outgoingDataPackets.increment(peers.incoming, { result: 'fulfilled' })
          } else {
            const { code } = ilp.res as IlpReject
            this._services.stats.outgoingDataPackets.increment(peers.incoming, { result: 'rejected', code })
          }
        } catch (err) {
          this._services.stats.outgoingDataPackets.increment(peers.incoming, { result: 'failed' })
          throw err
        }
      }
    })
  }
}
