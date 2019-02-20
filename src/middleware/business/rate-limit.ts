import { Errors, IlpPrepare, IlpReply } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import TokenBucket from '../../lib/token-bucket'
import { PeerInfo } from '../../types/peer'
import Stats from '../../services/stats'
const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = 10000

export interface RateLimitMiddlewareServices {
  bucket: TokenBucket
  stats: Stats
}

export class RateLimitMiddleware extends Middleware {
  private peerInfo: PeerInfo
  private stats: Stats

  constructor ({ bucket, stats }: RateLimitMiddlewareServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (!bucket.take()) {
          this.stats.rateLimitedPackets.increment(this.peerInfo, {})
          throw new RateLimitedError('too many requests, throttling.')
        }

        return next(request)
      }
    })
  }
}

export function createRateLimitBucketForPeer (peerInfo: PeerInfo) {
  const refillPeriod: number = peerInfo.rateLimit && peerInfo.rateLimit.refillPeriod ? peerInfo.rateLimit.refillPeriod : DEFAULT_REFILL_PERIOD
  const refillCount: number = peerInfo.rateLimit && peerInfo.rateLimit.refillCount ? peerInfo.rateLimit.refillCount : DEFAULT_REFILL_COUNT
  const capacity: number = peerInfo.rateLimit && peerInfo.rateLimit.capacity ? peerInfo.rateLimit.capacity : refillCount

  // TODO: When we add the ability to update middleware, our state will get
  //   reset every update, which may not be desired.
  return new TokenBucket({ refillPeriod, refillCount, capacity })
}
