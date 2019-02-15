// import { create as createLogger } from '../common/log'
// const log = createLogger('throughput-middleware')
import Middleware, { MiddlewareCallback, MiddlewareServices, Pipelines } from '../../types/middleware'
import { PeerInfo } from '../../types/peer'
import TokenBucket from '../../lib/token-bucket'
import { Errors, IlpPrepare, IlpReject, IlpReply, isPrepare } from 'ilp-packet'
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

export interface ThroughputMiddlewareServices extends MiddlewareServices {
  peerInfo: PeerInfo
}

export default class ThroughputMiddleware implements Middleware {

  private peerInfo: PeerInfo

  constructor ({ peerInfo }: ThroughputMiddlewareServices) {
    this.peerInfo = peerInfo
  }

  async applyToPipelines (pipelines: Pipelines) {
    if (this.peerInfo.throughput) {
      const {
        refillPeriod = DEFAULT_REFILL_PERIOD,
        incomingAmount = false,
        outgoingAmount = false
      } = this.peerInfo.throughput || {}

      if (incomingAmount) {
        // TODO: When we add the ability to update middleware, our state will get
        //   reset every update, which may not be desired.
        const incomingBucket = new TokenBucket({ refillPeriod, refillCount: Number(incomingAmount) })
        // log.trace('created incoming amount limit token bucket for account. accountId=%s refillPeriod=%s incomingAmount=%s', accountId, refillPeriod, incomingAmount)

        pipelines.incomingData.insertLast({
          name: 'throughput',
          method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
            if (isPrepare(packet)) {
              // TODO: Do we need a BigNumber-based token bucket?
              if (!incomingBucket.take(Number(packet.amount))) {
                throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
              }

              return next(packet)
            } else {
              return next(packet)
            }
          }
        })
      }

      if (outgoingAmount) {
        // TODO: When we add the ability to update middleware, our state will get
        //   reset every update, which may not be desired.
        const incomingBucket = new TokenBucket({ refillPeriod, refillCount: Number(outgoingAmount) })
        // log.trace('created outgoing amount limit token bucket for account. accountId=%s refillPeriod=%s outgoingAmount=%s', accountId, refillPeriod, outgoingAmount)

        pipelines.outgoingData.insertLast({
          name: 'throughput',
          method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
            if (isPrepare(packet)) {
              // TODO: Do we need a BigNumber-based token bucket?
              if (!incomingBucket.take(Number(packet.amount))) {
                throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
              }

              return next(packet)
            } else {
              return next(packet)
            }
          }
        })
      }
    }
  }
}
