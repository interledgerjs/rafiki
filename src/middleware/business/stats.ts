import { IlpPrepare, IlpReply, isFulfill } from 'ilp-packet'
import Middleware, {
  MiddlewareCallback,
  MiddlewareServices,
  Pipelines
} from '../../types/middleware'
import Stats from '../../services/stats'
import { PeerInfo } from '../../types/peer'

export interface StatsMiddlewareServices extends MiddlewareServices {
  peerInfo: PeerInfo,
  stats: Stats
}

export default class StatsMiddleware implements Middleware {
  private stats: Stats

  private peerInfo: PeerInfo

  constructor ({ stats, peerInfo }: StatsMiddlewareServices) {
    this.stats = stats
    this.peerInfo = peerInfo
  }

  async applyToPipelines (pipelines: Pipelines) {
    pipelines.incomingData.insertLast({
      name: 'stats',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        try {
          const reply = await next(packet)
          if (isFulfill(reply)) {
            this.stats.incomingDataPackets.increment(this.peerInfo, { result: 'fulfilled' })
          } else {
            this.stats.incomingDataPackets.increment(this.peerInfo, { result: 'rejected' })
          }
          return reply
        } catch (err) {
          this.stats.incomingDataPackets.increment(this.peerInfo, { result: 'failed' })
          throw err
        }
      }
    })

    pipelines.incomingMoney.insertLast({
      name: 'stats',
      method: async (amount: string, next: MiddlewareCallback<string, void>) => {
        try {
          const result = await next(amount)
          this.stats.incomingMoney.setValue(this.peerInfo, { result: 'succeeded' }, +amount)
          return result
        } catch (err) {
          this.stats.incomingMoney.setValue(this.peerInfo, { result: 'failed' }, +amount)
          throw err
        }
      }
    })

    pipelines.outgoingData.insertLast({
      name: 'stats',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        try {
          const reply = await next(packet)
          if (isFulfill(reply)) {
            this.stats.outgoingDataPackets.increment(this.peerInfo, { result: 'fulfilled' })
          } else {
            const { code } = reply
            this.stats.outgoingDataPackets.increment(this.peerInfo,
              { result: 'rejected', code })
          }
          return reply
        } catch (err) {
          this.stats.outgoingDataPackets.increment(this.peerInfo, { result: 'failed' })
          throw err
        }
      }
    })

    pipelines.outgoingMoney.insertLast({
      name: 'stats',
      method: async (amount: string, next: MiddlewareCallback<string, void>) => {
        try {
          const result = await next(amount)
          this.stats.outgoingMoney.setValue(this.peerInfo, { result: 'succeeded' }, +amount)
          return result
        } catch (err) {
          this.stats.outgoingMoney.setValue(this.peerInfo, { result: 'failed' }, +amount)
          throw err
        }
      }
    })
  }
}
