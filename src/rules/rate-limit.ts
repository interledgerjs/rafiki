import { Errors } from 'ilp-packet'
import { Rule } from '../types/rule'
import { TokenBucket } from '../lib/token-bucket'
import { PeerInfo } from '../types/peer'
import { log } from '../winston'
const logger = log.child({ component: 'rate-limit-rule' })

const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = 10000n

/**
 * Throttles throughput based on the number of requests per minute.
 */
export class RateLimitRule extends Rule {
  _buckets = new Map<string, TokenBucket>()
  constructor () {
    super({
      incoming: async ({ state: { ilp, peers: { incoming } } }, next) => {
        const { info } = await incoming
        let bucket = this._buckets.get(info.id)
        if (!bucket) {
          bucket = createRateLimitBucketForPeer(info)
          this._buckets.set(info.id, bucket)
        }
        if (!bucket.take()) {
          logger.warn(`rate limited a packet`, { bucket, ilp, peer: info })
          throw new RateLimitedError('too many requests, throttling.')
        }
        await next()
      }
    })
  }
}

export function createRateLimitBucketForPeer (peerInfo: PeerInfo) {
  const rateLimit = peerInfo.rules['rateLimit']
  const refillPeriod: number = rateLimit && rateLimit.refillPeriod ? rateLimit.refillPeriod : DEFAULT_REFILL_PERIOD
  const refillCount: bigint = rateLimit && rateLimit.refillCount ? rateLimit.refillCount : DEFAULT_REFILL_COUNT
  const capacity: bigint = rateLimit && rateLimit.capacity ? rateLimit.capacity : refillCount

  // TODO: When we add the ability to update middleware, our state will get
  //   reset every update, which may not be desired.
  return new TokenBucket({ refillPeriod, refillCount, capacity })
}
