import { Errors, IlpPrepare, IlpReply } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import TokenBucket from '../../lib/token-bucket'
import { PeerInfo } from '../../types/peer'
import Stats from '../../services/stats'
import { log } from '../../winston'
const logger = log.child({ component: 'rate-limit-middleware' })

const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = 10000

export interface RateLimitMiddlewareServices {
  peerInfo: PeerInfo
  bucket: TokenBucket
  stats: Stats
}

export class RateLimitMiddleware extends Middleware {
  constructor ({ peerInfo, bucket, stats }: RateLimitMiddlewareServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (!bucket.take()) {
          logger.warn(`rate limited a packet`, { bucket, request })
          stats.rateLimitedPackets.increment(peerInfo, {})
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
