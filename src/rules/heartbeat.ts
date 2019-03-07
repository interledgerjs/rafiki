import { IlpPrepare, Errors as IlpPacketErrors, IlpReply, isFulfill, IlpFulfill } from 'ilp-packet'
import { RequestHandler } from '../types/request-stream'
import { Rule } from '../types/rule'
import { Endpoint } from '../types/endpoint'

const DEFAULT_HEARTBEAT_INTERVAL = 30 * 1000

export interface HeartbeatRuleServices {
  endpoint: Endpoint<IlpPrepare, IlpReply>,
  onSuccessfulHeartbeat: () => void,
  onFailedHeartbeat: () => void,
  heartbeatInterval?: number
}
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
            const reply = await this.endpoint.sendOutgoingRequest({
              amount: '0',
              executionCondition: Buffer.alloc(0),
              destination: 'peer.heartbeat',
              expiresAt: new Date(Date.now() + 2000),
              data: Buffer.alloc(0)
            })

            this.onSuccessfulHeartbeat()
          } catch (e) {
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
