import { IlpPrepare, Errors as IlpPacketErrors, IlpReply, isFulfill, IlpFulfill } from 'ilp-packet'
import { RequestHandler } from '../types/request-stream'
import { Rule } from '../types/rule'
import { Endpoint } from '../types/endpoint'
import { log } from '../winston'
const logger = log.child({ component: 'heartbeat-rule' })

const DEFAULT_HEARTBEAT_INTERVAL = 30 * 1000

export interface HeartbeatRuleServices {
  endpoint: Endpoint<IlpPrepare, IlpReply>,
  onSuccessfulHeartbeat: () => void,
  onFailedHeartbeat: () => void,
  heartbeatInterval?: number
}

/**
 * Sends a peer.heartbeat message using a prescribed endpoint at a specified interval. Calls the onFailedHeartbeat function if the sending throws an error
 * otherwise onSuccessfullHeartbeat is called.
 */
export class HeartbeatRule extends Rule {

  heartbeat: NodeJS.Timeout
  interval: number
  onSuccessfulHeartbeat: () => void
  onFailedHeartbeat: () => void
  endpoint: Endpoint<IlpPrepare,IlpReply>
  constructor (options: HeartbeatRuleServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: RequestHandler<IlpPrepare, IlpReply>) => {
        const { destination, data } = request

        if (destination === 'peer.heartbeat') {
          logger.debug('received incoming heartbeat')
          return {
            fulfillment: data.slice(0, 32),
            data
          } as IlpFulfill
        }

        return next(request)
      },
      startup: async () => {
        this.heartbeat = setInterval(async () => {
          try {
            logger.debug('sending heartbeat')
            const reply = await this.endpoint.sendOutgoingRequest({
              amount: '0',
              executionCondition: Buffer.alloc(0),
              destination: 'peer.heartbeat',
              expiresAt: new Date(Date.now() + 2000),
              data: Buffer.alloc(0)
            })
            logger.debug('heartbeat successful')

            this.onSuccessfulHeartbeat()
          } catch (e) {
            logger.debug('heartbeat failed')
            this.onFailedHeartbeat()
          }
        }, this.interval)
      },
      shutdown: async () => clearInterval(this.heartbeat)
    })

    this.interval = options.heartbeatInterval || DEFAULT_HEARTBEAT_INTERVAL
    this.endpoint = options.endpoint
    this.onSuccessfulHeartbeat = options.onSuccessfulHeartbeat
    this.onFailedHeartbeat = options.onFailedHeartbeat
  }

}
