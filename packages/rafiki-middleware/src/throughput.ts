import { RafikiContext, PeerInfo, Peer } from '@interledger/rafiki-core'
import { Errors } from 'ilp-packet'
import { TokenBucket } from '@interledger/rafiki-utils'
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

/**
 * The Throughput rule throttles throughput based on the amount in the packets.
 */
export function createIncomingThroughputMiddleware () {

  const _buckets = new Map<string,TokenBucket>()

  return async ({ log, ilp, state: { peers: { incoming } } }: RafikiContext, next: () => Promise<any>) => {
    const peer = await incoming
    let incomingBucket = _buckets.get(peer.id)
    if (!incomingBucket) {
      incomingBucket = createThroughputLimitBucketsForPeer(peer, 'incoming')
      if (incomingBucket) _buckets.set(peer.id, incomingBucket)
    }
    if (incomingBucket) {
      if (!incomingBucket.take(BigInt(ilp.prepare.amount))) {
        log.warn('throttling incoming packet due to bandwidth exceeding limit', { ilp })
        throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
      }
    }
    await next()
  }
}

export function createOutgoingThroughputMiddleware () {

  const _buckets = new Map<string,TokenBucket>()

  return async ({ log, ilp, state: { peers: { outgoing } } }: RafikiContext, next: () => Promise<any>) => {
    const peer = await outgoing
    let outgoingBucket = _buckets.get(peer.id)
    if (!outgoingBucket) {
      outgoingBucket = createThroughputLimitBucketsForPeer(peer, 'outgoing')
      if (outgoingBucket) _buckets.set(peer.id, outgoingBucket)
    }
    if (outgoingBucket) {
      if (!outgoingBucket.take(BigInt(ilp.outgoingPrepare.amount))) {
        log.warn('throttling outgoing packet due to bandwidth exceeding limit', { ilp })
        throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
      }
    }
    await next()
  }
}

export function createThroughputLimitBucketsForPeer (peer: Peer, inOrOut: 'incoming' | 'outgoing'): TokenBucket | undefined {
  const refillPeriod = peer['throughputLimitRefillPeriod'] || DEFAULT_REFILL_PERIOD
  const incomingAmount = peer['throughputIncomingAmount'] || false
  const outgoingAmount = peer['throughputOutgingAmount'] || false

  if (inOrOut === 'incoming' && incomingAmount) {
    // TODO: We should handle updates to the peer config
    return new TokenBucket({ refillPeriod, refillCount: BigInt(incomingAmount) })
  }
  if (inOrOut === 'outgoing' && outgoingAmount) {
    // TODO: We should handle updates to the peer config
    return new TokenBucket({ refillPeriod, refillCount: BigInt(outgoingAmount) })
  }
}
