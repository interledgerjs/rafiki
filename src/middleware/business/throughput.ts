import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { PeerInfo } from '../../types/peer'
import TokenBucket from '../../lib/token-bucket'
import { Errors, IlpPrepare, IlpReject, IlpReply, isPrepare } from 'ilp-packet'
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

export interface ThroughputMiddlewareServices {
  incomingBucket?: TokenBucket,
  outgoingBucket?: TokenBucket
}

/**
 * The Throughput middleware throttles throughput based on the amount in the packets.
 */
export class ThroughputMiddleware extends Middleware {
  constructor ({ incomingBucket, outgoingBucket }: ThroughputMiddlewareServices) {

    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (incomingBucket && isPrepare(request)) {
          // TODO: Do we need a BigNumber-based token bucket?
          if (!incomingBucket.take(Number(request.amount))) {
            throw new InsufficientLiquidityError('exceeded money bandwidth, throttling.')
          }
          return next(request)
        } else {
          return next(request)
        }
      },
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (outgoingBucket && isPrepare(request)) {
          // TODO: Do we need a BigNumber-based token bucket?
          if (!outgoingBucket.take(Number(request.amount))) {
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

  if (peerInfo.throughput) {
    const {
      refillPeriod = DEFAULT_REFILL_PERIOD,
      incomingAmount = false,
      outgoingAmount = false
    } = peerInfo.throughput || {}

    if (incomingAmount) {
      // TODO: When we add the ability to update middleware, our state will get
      //   reset every update, which may not be desired.
      buckets.incomingBucket = new TokenBucket({ refillPeriod, refillCount: Number(incomingAmount) })
    }
    if (outgoingAmount) {
      // TODO: When we add the ability to update middleware, our state will get
      //   reset every update, which may not be desired.
      buckets.outgoingBucket = new TokenBucket({ refillPeriod, refillCount: Number(outgoingAmount) })
    }
  }

  return buckets
}
