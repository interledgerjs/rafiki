import { Errors } from 'ilp-packet'
import { PeerInfo, RafikiContext, RafikiMiddleware } from '@interledger/rafiki-core'
import { TokenBucket } from '@interledger/rafiki-utils'

const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = 10000n

/**
 * Throttles throughput based on the number of requests per minute.
 */
export function createIncomingRateLimitMiddleware (): RafikiMiddleware {
  return async ({ log, request : { prepare }, peers }: RafikiContext, next: () => Promise<any>) => {
    const peer = await peers.incoming
    let bucket = this._buckets.get(peer.id)
    if (!bucket) {
      bucket = createRateLimitBucketForPeer(peer)
      this._buckets.set(peer.id, bucket)
    }
    if (!bucket.take()) {
      log.warn(`rate limited a packet`, { bucket, prepare, peer })
      throw new RateLimitedError('too many requests, throttling.')
    }
    await next()
  }
}

export function createRateLimitBucketForPeer (peerInfo: PeerInfo) {
  const { rateLimitRefillPeriod, rateLimitRefillCount, rateLimitCapacity } = peerInfo
  const refillPeriod: number = rateLimitRefillPeriod ? rateLimitRefillPeriod : DEFAULT_REFILL_PERIOD
  const refillCount: bigint = rateLimitRefillCount ? rateLimitRefillCount : DEFAULT_REFILL_COUNT
  const capacity: bigint = rateLimitCapacity ? rateLimitCapacity : refillCount

  // TODO: When we add the ability to update middleware, our state will get
  //   reset every update, which may not be desired.
  return new TokenBucket({ refillPeriod, refillCount, capacity })
}
