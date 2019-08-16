import { Rule } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { TokenBucket } from '../lib/token-bucket'
import { Errors } from 'ilp-packet'
import { log } from '../winston'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'throughput' })
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

/**
 * The Throughput rule throttles throughput based on the amount in the packets.
 */
export function createIncomingThroughputMiddleware () {

  const _buckets = new Map<string,TokenBucket>()

  return async ({ ilp, state: { peers: { incoming } } }: RafikiContext, next: () => Promise<any>) => {
    const peer = await incoming
    let incomingBucket = _buckets.get(peer.id)
    if (!incomingBucket) {
      incomingBucket = createThroughputLimitBucketsForPeer(peer, 'incoming')
      if (incomingBucket) _buckets.set(peer.id, incomingBucket)
    }
    if (incomingBucket) {
      if (!incomingBucket.take(BigInt(ilp.prepare.amount))) {
        logger.warn('throttling incoming packet due to bandwidth exceeding limit', { ilp })
        throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
      }
    }
    await next()
  }
}

export function createOutgoingThroughputMiddleware () {

  const _buckets = new Map<string,TokenBucket>()

  return async ({ ilp, state: { peers: { outgoing } } }: RafikiContext, next: () => Promise<any>) => {
    const peer = await outgoing
    let outgoingBucket = _buckets.get(peer.id)
    if (!outgoingBucket) {
      outgoingBucket = createThroughputLimitBucketsForPeer(peer, 'outgoing')
      if (outgoingBucket) _buckets.set(peer.id, outgoingBucket)
    }
    if (outgoingBucket) {
      if (!outgoingBucket.take(BigInt(ilp.outgoingPrepare.amount))) {
        logger.warn('throttling outgoing packet due to bandwidth exceeding limit', { ilp })
        throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
      }
    }
    await next()
  }
}

export function createThroughputLimitBucketsForPeer (peerInfo: PeerInfo, inOrOut: 'incoming' | 'outgoing'): TokenBucket | undefined {
  const throughput = peerInfo.rules['throughput']
  if (throughput) {
    const {
      refillPeriod = DEFAULT_REFILL_PERIOD,
      incomingAmount = false,
      outgoingAmount = false
    } = throughput || {}

    if (inOrOut === 'incoming' && incomingAmount) {
      // TODO: When we add the ability to update middleware, our state will get
      //   reset every update, which may not be desired.
      return new TokenBucket({ refillPeriod, refillCount: BigInt(incomingAmount) })
    }
    if (inOrOut === 'outgoing' && outgoingAmount) {
      // TODO: When we add the ability to update middleware, our state will get
      //   reset every update, which may not be desired.
      return new TokenBucket({ refillPeriod, refillCount: BigInt(outgoingAmount) })
    }
  }
}
