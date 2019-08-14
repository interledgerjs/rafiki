import { Rule } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { TokenBucket } from '../lib/token-bucket'
import { Errors } from 'ilp-packet'
import { log } from '../winston'
const logger = log.child({ component: 'throughput-rule' })
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

/**
 * The Throughput rule throttles throughput based on the amount in the packets.
 */
export class ThroughputRule extends Rule {
  _incomingBuckets = new Map<string,TokenBucket>()
  _outgoingBuckets = new Map<string,TokenBucket>()
  constructor () {
    super({
      incoming: async ({ state: { ilp, peers: { incoming : { info } } } }, next) => {
        let incomingBucket = this._incomingBuckets.get(info.id)
        if (!incomingBucket) {
          incomingBucket = createThroughputLimitBucketsForPeer(info, 'incoming')
          if (incomingBucket) this._incomingBuckets.set(info.id, incomingBucket)
        }
        if (incomingBucket) {
          if (!incomingBucket.take(BigInt(ilp.req.amount))) {
            logger.warn('throttling incoming packet due to bandwidth exceeding limit', { ilp })
            throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
          }
        }
        await next()
      },
      outgoing: async ({ state: { ilp, peers: { outgoing : { info } } } }, next) => {
        let outgoingBucket = this._outgoingBuckets.get(info.id)
        if (!outgoingBucket) {
          outgoingBucket = createThroughputLimitBucketsForPeer(info, 'outgoing')
          if (outgoingBucket) this._outgoingBuckets.set(info.id, outgoingBucket)
        }
        if (outgoingBucket) {
          if (!outgoingBucket.take(ilp.outgoingAmount)) {
            logger.warn('throttling outgoing packet due to bandwidth exceeding limit', { ilp })
            throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
          }
        }
        await next()
      }
    })
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
