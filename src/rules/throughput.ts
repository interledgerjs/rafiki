import { Rule, IlpRequestHandler } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { TokenBucket } from '../lib/token-bucket'
import { Errors, IlpPrepare, IlpReply, isPrepare } from 'ilp-packet'
import { log } from '../winston'
const logger = log.child({ component: 'throughput-middleware' })
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

export interface ThroughputRuleServices {
  incomingBucket?: TokenBucket,
  outgoingBucket?: TokenBucket
}

/**
 * The Throughput rule throttles throughput based on the amount in the packets.
 */
export class ThroughputRule extends Rule {
  constructor ({ incomingBucket, outgoingBucket }: ThroughputRuleServices) {

    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (incomingBucket && isPrepare(request)) {
          if (!incomingBucket.take(BigInt(request.amount))) {
            logger.warn('throttling incoming packet due to bandwidth exceeding limit', { request })
            throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
          }
          return next(request)
        } else {
          return next(request)
        }
      },
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (outgoingBucket && isPrepare(request)) {
          if (!outgoingBucket.take(BigInt(request.amount))) {
            logger.warn('throttling outgoing packet due to bandwidth exceeding limit', { request })
            throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
          }
          return next(request)
        } else {
          return next(request)
        }
      }
    })
  }
}

export function createThroughputLimitBucketsForPeer (peerInfo: PeerInfo): { incomingBucket?: TokenBucket, outgoingBucket?: TokenBucket } {

  const buckets = {
    incomingBucket: undefined,
    outgoingBucket : undefined
  } as {
    incomingBucket?: TokenBucket,
    outgoingBucket?: TokenBucket
  }

  const throughput = peerInfo.rules.filter(rule => rule.name === 'throughput')[0]
  if (throughput) {
    const {
      refillPeriod = DEFAULT_REFILL_PERIOD,
      incomingAmount = false,
      outgoingAmount = false
    } = throughput || {}

    if (incomingAmount) {
      // TODO: When we add the ability to update middleware, our state will get
      //   reset every update, which may not be desired.
      buckets.incomingBucket = new TokenBucket({ refillPeriod, refillCount: BigInt(incomingAmount) })
    }
    if (outgoingAmount) {
      // TODO: When we add the ability to update middleware, our state will get
      //   reset every update, which may not be desired.
      buckets.outgoingBucket = new TokenBucket({ refillPeriod, refillCount: BigInt(outgoingAmount) })
    }
  }

  return buckets
}
