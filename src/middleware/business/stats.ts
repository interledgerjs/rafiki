import { IlpPrepare, IlpReply, isFulfill } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import Stats from '../../services/stats'
import { PeerInfo } from '../../types/peer'

export interface StatsMiddlewareServices {
  peerInfo: PeerInfo,
  stats: Stats
}

export class StatsMiddleware extends Middleware {
  constructor ({ stats, peerInfo }: StatsMiddlewareServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler, sendCallback?: () => void): Promise<IlpReply> => {
        try {
          const reply = await next(request, sendCallback)
          if (isFulfill(reply)) {
            stats.incomingDataPackets.increment(peerInfo, { result: 'fulfilled' })
          } else {
            stats.incomingDataPackets.increment(peerInfo, { result: 'rejected' })
          }
          return reply
        } catch (err) {
          stats.incomingDataPackets.increment(peerInfo, { result: 'failed' })
          throw err
        }
      },
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler, sendCallback?: () => void): Promise<IlpReply> => {
        try {
          const reply = await next(request, sendCallback)
          if (isFulfill(reply)) {
            stats.outgoingDataPackets.increment(peerInfo, { result: 'fulfilled' })
          } else {
            const { code } = reply
            stats.outgoingDataPackets.increment(peerInfo, { result: 'rejected', code })
          }
          return reply
        } catch (err) {
          stats.outgoingDataPackets.increment(peerInfo, { result: 'failed' })
          throw err
        }
      }
    })
  }
}
