
import { createHash } from 'crypto'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeEnvelope } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import BigNumber from 'bignumber.js'

// Where in the ILP packet does the static data begin (i.e. the data that is not modified hop-to-hop)
const STATIC_DATA_OFFSET = 25 // 8 byte amount + 17 byte expiry date

const DEFAULT_CLEANUP_INTERVAL = 30000
const DEFAULT_PACKET_LIFETIME = 30000

export interface CachedPacket {
  amount: string,
  expiresAt: Date,
  promise: Promise<IlpReply>
}

export interface DeduplicateMiddlewareServices {
  cache: PacketCache
}

export class DeduplicateMiddleware extends Middleware {
  constructor ({ cache }: DeduplicateMiddlewareServices) {

    super({
      processOutgoing: (request: IlpPrepare, next: IlpRequestHandler) => {

        const key = cacheKey(request)
        const { amount, expiresAt } = request
        const cachedPacket = cache.get(key)

        if (cachedPacket) {
            // We have seen this packet before, let's check if previous amount and expiresAt were larger
          if (new BigNumber(cachedPacket.amount).gte(amount) && cachedPacket.expiresAt >= expiresAt) {
            return cachedPacket.promise
          }
        }

        const promise = next(request)
        cache.set(key, {
          amount,
          expiresAt,
          promise
        })

        return promise
      }
    })
  }
}

export interface PacketCacheOptions {
  cleanupInterval?: number,
  packetLifetime?: number,
  packetCache?: Map<string, CachedPacket>
}

export class PacketCache {

  private _timer: NodeJS.Timeout
  private _packetCache: Map<string, CachedPacket> = new Map()
  private _cleanupInterval: number
  private _packetLifetime: number

  constructor ({ cleanupInterval, packetLifetime, packetCache }: PacketCacheOptions) {
    this._cleanupInterval = cleanupInterval || DEFAULT_CLEANUP_INTERVAL
    this._packetLifetime = packetLifetime || DEFAULT_PACKET_LIFETIME
    this._packetCache = packetCache || new Map()
    this._timer = setInterval(() => this.cleanupCache(this._packetLifetime), this._cleanupInterval)
  }

  public get (key: string): CachedPacket | undefined {
    return this._packetCache.get(key)
  }

  public set (key: string, packet: CachedPacket) {
    this._packetCache.set(key, packet)
  }

  public dispose () {
    clearInterval(this._timer)
  }

  private cleanupCache (packetLifetime: number) {
    const now = Date.now()
    for (const index of this._packetCache.keys()) {
      const cachedPacket = this._packetCache.get(index)
      if (!cachedPacket) continue
      const packetExpiry = cachedPacket.expiresAt.getTime() + packetLifetime
      if (packetExpiry < now) {
        this._packetCache.delete(index)
      }
    }
  }
}

function cacheKey (packet: IlpPrepare): string {
  const { contents } = deserializeEnvelope(serializeIlpPrepare(packet))
  return createHash('sha256')
      .update(contents.slice(STATIC_DATA_OFFSET))
      .digest()
      .slice(0, 16) // 128 bits is enough and saves some memory
      .toString('base64')
}
