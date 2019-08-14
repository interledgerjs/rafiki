import { serializeIlpPrepare } from 'ilp-packet'
import { Rule } from '../types/rule'
import { log } from '../winston'
import { RafikiContext } from '../rafiki'
const logger = log.child({ component: 'heartbeat-rule' })

const DEFAULT_HEARTBEAT_INTERVAL = 30 * 1000

export interface HeartbeatRuleServices {
  onSuccessfulHeartbeat: (peerId: string) => void,
  onFailedHeartbeat: (peerId: string) => void,
  heartbeatInterval?: number
}

/**
 * Sends a peer.heartbeat message using a prescribed endpoint at a specified interval. Calls the onFailedHeartbeat function if the sending throws an error
 * otherwise onSuccessfullHeartbeat is called.
 */
export class HeartbeatRule extends Rule {

  _heartbeat: NodeJS.Timeout
  _interval: number
  _onSuccessfulHeartbeat: (peerId: string) => void
  _onFailedHeartbeat: (peerId: string) => void
  constructor (options: HeartbeatRuleServices) {
    super({
      incoming: async ({ state: { ilp } }, next) => {
        const { destination, data } = ilp.req
        if (destination === 'peer.heartbeat') {
          logger.debug('received incoming heartbeat')
          ilp.res = {
            fulfillment: data.slice(0, 32),
            data
          }
          return
        }
        await next()
      }
      // TODO: Need to rework
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
    })

    this._interval = options.heartbeatInterval || DEFAULT_HEARTBEAT_INTERVAL
    this._onSuccessfulHeartbeat = options.onSuccessfulHeartbeat
    this._onFailedHeartbeat = options.onFailedHeartbeat
  }

}
