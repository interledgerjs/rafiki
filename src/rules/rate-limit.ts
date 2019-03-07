import { Errors, IlpPrepare, IlpReply } from 'ilp-packet'
import { Rule, IlpRequestHandler } from '../types/rule'
import TokenBucket from '../lib/token-bucket'
import { PeerInfo } from '../types/peer'
import Stats from '../services/stats'
import { log } from '../winston'
const logger = log.child({ component: 'rate-limit-middleware' })

const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = 10000n

export interface RateLimitRuleServices {
  peerInfo: PeerInfo
  bucket: TokenBucket
  stats: Stats
}

export class RateLimitRule extends Rule {
  constructor ({ peerInfo, bucket, stats }: RateLimitRuleServices) {
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
  const rateLimit = peerInfo.rules.filter(rule => rule.name === 'rateLimit')[0]
  const refillPeriod: number = rateLimit && rateLimit.refillPeriod ? rateLimit.refillPeriod : DEFAULT_REFILL_PERIOD
  const refillCount: bigint = rateLimit && rateLimit.refillCount ? rateLimit.refillCount : DEFAULT_REFILL_COUNT
  const capacity: bigint = rateLimit && rateLimit.capacity ? rateLimit.capacity : refillCount

  // TODO: When we add the ability to update middleware, our state will get
  //   reset every update, which may not be desired.
  return new TokenBucket({ refillPeriod, refillCount, capacity })
}
