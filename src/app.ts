import * as log from 'winston'
import { Middleware } from './types/middleware'
import Connector from './connector'
import { PeerInfo } from './types/peer'
import { ErrorHandlerMiddleware } from './middleware/business/error-handler'
import { RateLimitMiddleware, createRateLimitBucketForPeer } from './middleware/business/rate-limit'
import { MaxPacketAmountMiddleware } from './middleware/business/max-packet-amount'
import { ThroughputMiddleware, createThroughputLimitBucketsForPeer } from './middleware/business/throughput'
import { DeduplicateMiddleware, PacketCache } from './middleware/business/deduplicate'
import { ExpireMiddleware } from './middleware/business/expire'
import { ValidateFulfillmentMiddleware } from './middleware/business/validate-fulfillment'
import { StatsMiddleware } from './middleware/business/stats'
import { AlertMiddleware, Alerts } from './middleware/business/alert'
import TokenBucket from './lib/token-bucket'
import Stats from './services/stats'
import { IlpPrepare, IlpReply, IlpFulfill } from 'ilp-packet'
import { ReduceExpiryMiddleware } from './middleware/protocol/reduce-expiry'
import { Http2Server, createServer } from 'http2'

export interface AppOptions {
  ilpAddress: string
  port: number,
}

export default class App {

  connector: Connector
  stats: Stats
  alerts: Alerts
  packetCacheMap: Map<string, PacketCache>
  rateLimitBucketMap: Map<string, TokenBucket>
  throughputBucketsMap: Map<string, { incomingBucket?: TokenBucket, outgoingBucket?: TokenBucket }>

  server: Http2Server
  port: number

  constructor (opts: AppOptions) {

    this.connector = new Connector()
    this.stats = new Stats()
    this.alerts = new Alerts()
    this.packetCacheMap = new Map()
    this.rateLimitBucketMap = new Map()
    this.throughputBucketsMap = new Map()

    this.port = opts.port

    this.connector.setOwnAddress(opts.ilpAddress)

    this.server = createServer()

    this.server.on('stream', (stream, headers, flags) => {
      const method = headers[':method']
      const path = headers[':path']

      stream.respond({
        'content-type': 'text/html',
        ':status': 200
      })
      stream.on('error', (error) => console.error(error))
      stream.end('<h1>Hello World</h1>')
    })
  }

  /**
   * Loop through configured accounts and instantiate the specified endpoint and middleware. Tell the connector to add the peer.
   */
  async start () {
    log.info('starting connector')
    this.server.listen(this.port)
  }

  private handleIncomingPacket (path: string, data: Buffer) {
  }

  async addPeer (peerInfo: PeerInfo) {
    // const peerInfo: PeerInfo = {
    //   id: account,
    //   assetScale,
    //   assetCode,
    //   relation,
    //   deduplicate,
    //   maxPacketAmount: maxPacketAmount ? BigInt.asUintN(64, BigInt(maxPacketAmount)) : undefined,
    //   throughput: throughput ? {
    //     incomingAmount: throughput.incomingAmount ? BigInt.asUintN(64, BigInt(throughput.incomingAmount)) : undefined,
    //     outgoingAmount: throughput.outgoingAmount ? BigInt.asUintN(64, BigInt(throughput.outgoingAmount)) : undefined,
    //     refillPeriod: throughput.refillPeriod
    //   } : undefined,
    //   rateLimit: rateLimit ? {
    //     capacity: rateLimit.capacity ? BigInt.asUintN(64, BigInt(rateLimit.capacity)) : undefined,
    //     refillCount: rateLimit.refillCount ? BigInt.asUintN(64, BigInt(rateLimit.refillCount)) : undefined,
    //     refillPeriod: rateLimit.refillPeriod
    //   } : undefined,
    //   sendRoutes,
    //   receiveRoutes
    // }
    // const middleware = this._createMiddleware(peerInfo)
    // const endpointDefinition = typeof (endpoint) === 'object' ? endpoint : require(endpoint) // TODO update when implementations of endpoint are released
    // const endpointInstance = typeof (endpoint) === 'object' ? endpoint : new endpointDefinition(async (packet: IlpPrepare): Promise<IlpReply> => { return {} as IlpFulfill }) // TODO update when implementations of endpoint are released. assuming to be mock endpoint for now
    // // TODO: make sure that endpoint is connected before handing it to connector
    // await this.connector.addPeer(peerInfo, endpointInstance, middleware, peerInfo.id === inheritFrom)
  }

  /**
   * Tells connector to remove its peers and clears the stored packet caches and token buckets. The connector is responsible for shutting down the peer's middleware.
   */
  async shutdown () {
    this.connector.getPeerList().forEach((peerId: string) => this.connector.removePeer(peerId))
    Array.from(this.packetCacheMap.values()).forEach(cache => cache.dispose())
    this.packetCacheMap.clear()
    this.rateLimitBucketMap.clear()
    this.throughputBucketsMap.clear()
    this.server.close()
  }

  private _createMiddleware (peerInfo: PeerInfo): Middleware[] {
    const middleware: Middleware[] = []
    const disabledMiddleware = this.config.disableMiddleware ? this.config.disableMiddleware : []
    const globalMinExpirationWindow = this.config.minMessageWindow
    const globalMaxHoldWindow = this.config.maxHoldTime
    const rateLimitBucket: TokenBucket = createRateLimitBucketForPeer(peerInfo)
    const throughputBuckets = createThroughputLimitBucketsForPeer(peerInfo)
    const cache = new PacketCache(peerInfo.deduplicate || {}) // Could make this a global cache to allow for checking across different peers?

    this.packetCacheMap.set(peerInfo.id, cache)
    this.throughputBucketsMap.set(peerInfo.id, throughputBuckets)
    this.rateLimitBucketMap.set(peerInfo.id, rateLimitBucket)

    // TODO add balance middleware
    middleware.push(new ExpireMiddleware())
    // using half the global min expiration window to mimic old connector. This is because current implementation reduces expiry on both incoming and outgoing pipelines.
    middleware.push(new ReduceExpiryMiddleware({ minIncomingExpirationWindow: 0.5 * globalMinExpirationWindow, minOutgoingExpirationWindow: 0.5 * globalMinExpirationWindow, maxHoldWindow: globalMaxHoldWindow }))
    if (!disabledMiddleware.includes('errorHandler')) middleware.push(new ErrorHandlerMiddleware({ getOwnIlpAddress: () => this.connector.getOwnAddress() || '' }))
    if (!disabledMiddleware.includes('rateLimit')) middleware.push(new RateLimitMiddleware({ peerInfo, stats: this.stats, bucket: rateLimitBucket }))
    if (!disabledMiddleware.includes('maxPacketAmount')) middleware.push(new MaxPacketAmountMiddleware({ maxPacketAmount: peerInfo.maxPacketAmount }))
    if (!disabledMiddleware.includes('throughput')) middleware.push(new ThroughputMiddleware(throughputBuckets))
    if (!disabledMiddleware.includes('deduplicate')) middleware.push(new DeduplicateMiddleware({ cache }))
    if (!disabledMiddleware.includes('validateFulfillment')) middleware.push(new ValidateFulfillmentMiddleware())
    if (!disabledMiddleware.includes('stats')) middleware.push(new StatsMiddleware({ stats: this.stats, peerInfo }))
    if (!disabledMiddleware.includes('alert')) middleware.push(new AlertMiddleware({ createAlert: (triggeredBy: string, message: string) => this.alerts.createAlert(peerInfo.id, triggeredBy, message) }))

    return middleware
  }

}
