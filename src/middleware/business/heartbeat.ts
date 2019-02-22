import { IlpPrepare, Errors as IlpPacketErrors, IlpReply, isFulfill, IlpFulfill } from 'ilp-packet'
import { RequestHandler } from '../../types/channel'
import { Middleware } from '../../types/middleware'
import { Endpoint } from '../../types/endpoint'
import { PeerInfo } from '../../types/peer'

const DEFAULT_HEARTBEAT_INTERVAL = 30 * 1000

export interface HeartbeatMiddlewareServices {
  endpoint: Endpoint<IlpPrepare, IlpReply>,
  onSuccessfullHeartbeat: () => void,
  onFailedHeartbeat: () => void,
  heartbeatInterval?: number
}
export class HeartbeatMiddleware extends Middleware {

  heartbeat: NodeJS.Timeout
  interval: number
  onSuccessfullHeartbeat: () => void
  onFailedHeartbeat: () => void
  endpoint: Endpoint<IlpPrepare,IlpReply>
  constructor (options: HeartbeatMiddlewareServices) {
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

            this.onSuccessfullHeartbeat()
          } catch (e) {
            this.onFailedHeartbeat()
          }
        }, this.interval)
      },
      shutdown: async () => clearInterval(this.heartbeat)
    })

    this.interval = options.heartbeatInterval || DEFAULT_HEARTBEAT_INTERVAL
    this.endpoint = options.endpoint
    this.onSuccessfullHeartbeat = options.onSuccessfullHeartbeat
    this.onFailedHeartbeat = options.onFailedHeartbeat
  }

}
