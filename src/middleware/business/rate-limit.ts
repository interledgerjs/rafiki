import { Errors, IlpPrepare, IlpReject, IlpReply } from 'ilp-packet'
// import { create as createLogger } from '../common/log'
// const log = createLogger('rate-limit-middleware')
import Middleware, {
  MiddlewareCallback,
  MiddlewareServices,
  Pipelines
} from '../../types/middleware'
import TokenBucket from '../../lib/token-bucket'
import { PeerInfo } from '../../types/peer'
import Stats from '../../services/stats'
const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = 10000

export interface RateLimitMiddlewareServices extends MiddlewareServices {
  peerInfo: PeerInfo
  stats: Stats
}

export default class RateLimitMiddleware implements Middleware {
  private peerInfo: PeerInfo
  private stats: Stats

  constructor ({ peerInfo, stats }: RateLimitMiddlewareServices) {
    this.peerInfo = peerInfo
    this.stats = stats
  }

  async applyToPipelines (pipelines: Pipelines) {
    const refillPeriod: number = this.peerInfo.rateLimit && this.peerInfo.rateLimit.refillPeriod ? this.peerInfo.rateLimit.refillPeriod : DEFAULT_REFILL_PERIOD
    const refillCount: number = this.peerInfo.rateLimit && this.peerInfo.rateLimit.refillCount ? this.peerInfo.rateLimit.refillCount : DEFAULT_REFILL_COUNT
    const capacity: number = this.peerInfo.rateLimit && this.peerInfo.rateLimit.capacity ? this.peerInfo.rateLimit.capacity : refillCount

    // log.trace('created token bucket for account. accountId=%s refillPeriod=%s refillCount=%s capacity=%s', accountId, refillPeriod, refillCount, capacity)

    // TODO: When we add the ability to update middleware, our state will get
    //   reset every update, which may not be desired.
    const bucket = new TokenBucket({ refillPeriod, refillCount, capacity })

    pipelines.incomingData.insertLast({
      name: 'rateLimit',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        if (!bucket.take()) {
          this.stats.rateLimitedPackets.increment(this.peerInfo, {})
          throw new RateLimitedError('too many requests, throttling.')
        }

        return next(packet)
      }
    })
  }
}
