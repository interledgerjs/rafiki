
// import { create as createLogger } from '../common/log'
import { createHash } from 'crypto'
import { IlpPrepare, Errors as IlpPacketErrors, IlpReply, isFulfill, IlpFulfill, serializeIlpPrepare, deserializeEnvelope } from 'ilp-packet'
import Middleware, { MiddlewareCallback, MiddlewareServices, Pipelines } from '../../types/middleware'
import BigNumber from 'bignumber.js'
import { PeerInfo } from '../../types/peer'

// Where in the ILP packet does the static data begin (i.e. the data that is not modified hop-to-hop)
const STATIC_DATA_OFFSET = 25 // 8 byte amount + 17 byte expiry date

const DEFAULT_CLEANUP_INTERVAL = 30000
const DEFAULT_PACKET_LIFETIME = 30000

export interface CachedPacket {
  amount: string,
  expiresAt: Date,
  promise: Promise<IlpReply>
}

export interface DeduplicateMiddlewareServices extends MiddlewareServices {
  peerInfo: PeerInfo,
  cleanupInterval?: number,
  packetLifetime?: number,
  packetCache?: Map<string, CachedPacket>
}

export default class DeduplicateMiddleware implements Middleware {
  private packetCache: Map<string, CachedPacket> = new Map()
  private peerInfo: PeerInfo

  private cleanupInterval: number
  private packetLifetime: number

  constructor ({ peerInfo, cleanupInterval, packetLifetime, packetCache }: DeduplicateMiddlewareServices) {
    this.peerInfo = peerInfo,
    this.cleanupInterval = cleanupInterval || DEFAULT_CLEANUP_INTERVAL
    this.packetLifetime = packetLifetime || DEFAULT_PACKET_LIFETIME
    this.packetCache = packetCache || new Map()
  }

  async applyToPipelines (pipelines: Pipelines) {
    // const log = createLogger(`deduplicate-middleware[${accountId}]`) //TODO add back logging

    let interval: NodeJS.Timeout
    pipelines.startup.insertLast({
      name: 'deduplicate',
      method: async (dummy: void, next: MiddlewareCallback<void, void>) => {
        interval = setInterval(() => this.cleanupCache(this.packetLifetime), this.cleanupInterval)
        return next(dummy)
      }
    })

    pipelines.shutdown.insertLast({
      name: 'deduplicate',
      method: async (dummy: void, next: MiddlewareCallback<void, void>) => {
        clearInterval(interval)
        return next(dummy)
      }
    })

    pipelines.outgoingData.insertLast({
      name: 'deduplicate',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {

        const { contents } = deserializeEnvelope(serializeIlpPrepare(packet))

        const index = createHash('sha256')
            .update(contents.slice(STATIC_DATA_OFFSET))
            .digest()
            .slice(0, 16) // 128 bits is enough and saves some memory
            .toString('base64')

        const { amount, expiresAt } = packet
        const cachedPacket = this.packetCache.get(index)

        if (cachedPacket) {
            // We have seen this packet before, let's check if previous amount and expiresAt were larger
          if (new BigNumber(cachedPacket.amount).gte(amount) && cachedPacket.expiresAt >= expiresAt) {
              // TODO add back logging
              // log.warn('deduplicate packet cache hit. accountId=%s elapsed=%s amount=%s', accountId, cachedPacket.expiresAt.getTime() - Date.now(), amount)
            return cachedPacket.promise
          }
        }

        const promise = next(packet)
        this.packetCache.set(index, {
          amount,
          expiresAt,
          promise
        })

        return promise
      }
    })
  }

  private cleanupCache (packetLifetime: number) {
    const now = Date.now()
    for (const index of this.packetCache.keys()) {
      const cachedPacket = this.packetCache.get(index)
      if (!cachedPacket) continue
      const packetExpiry = cachedPacket.expiresAt.getTime() + packetLifetime
      if (packetExpiry < now) {
        this.packetCache.delete(index)
      }
    }
  }
}
