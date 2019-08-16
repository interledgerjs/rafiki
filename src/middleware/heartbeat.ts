import { serializeIlpPrepare } from 'ilp-packet'
import { RafikiContext } from '../rafiki'
import { log } from '../winston'
const logger = log.child({ middleware: 'heartbeat' })

const DEFAULT_HEARTBEAT_INTERVAL = 30 * 1000

export interface HeartbeatRuleServices {
  onSuccessfulHeartbeat: (peerId: string) => void,
  onFailedHeartbeat: (peerId: string) => void,
  heartbeatInterval?: number
}

/**
 * Sends a peer.heartbeat message using a prescribed endpoint at a specified interval. Calls the onFailedHeartbeat function if the sending throws an error
 * otherwise onSuccessfullHeartbeat is called.
 *
 * TODO: Should be a controller
 */
export function createIncomingHeartbeatMiddleware (config: HeartbeatRuleServices) {
  return async ({ ilp }: RafikiContext, next: () => Promise<any>) => {
    const { destination, data } = ilp.prepare
    if (destination === 'peer.heartbeat') {
      logger.debug('received incoming heartbeat')
      ilp.respond({
        fulfillment: data.slice(0, 32),
        data
      })
      return
    } else {
      await next()
    }
  }
}

// TODO: Need to rework logic for starting heartbeat timer
// startup: async (ctx: RafikiContext) => {
//   this._heartbeat = setInterval(async () => {
//     // TODO: Stagger the sending
//     for (let peerId in ctx.services.peers) {
//       try {
//         logger.debug('sending heartbeat', { peerId })
//         await ctx.services.peers.getOrThrow(peerId).client.send(
//           serializeIlpPrepare({
//             amount: '0',
//             executionCondition: Buffer.alloc(0),
//             destination: 'peer.heartbeat',
//             expiresAt: new Date(Date.now() + 2000),
//             data: Buffer.alloc(0)
//           }))
//         logger.debug('heartbeat successful')
//         this._onSuccessfulHeartbeat(peerId)
//       } catch (e) {
//         logger.debug('heartbeat failed')
//         this._onFailedHeartbeat(peerId)
//       }
//     }
//   }, this._interval)
// },
// shutdown: async () => clearInterval(this._heartbeat)
