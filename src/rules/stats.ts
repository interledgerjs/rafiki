import { IlpPrepare, IlpReply, isFulfill } from 'ilp-packet'
import { Rule, IlpRequestHandler } from '../types/rule'
import Stats from '../services/stats'
import { PeerInfo } from '../types/peer'

export interface StatsRuleServices {
  peerInfo: PeerInfo,
  stats: Stats
}

export class StatsRule extends Rule {
  constructor ({ stats, peerInfo }: StatsRuleServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        try {
          const reply = await next(request)
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
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        try {
          const reply = await next(request)
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
