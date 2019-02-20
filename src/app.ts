import { Middleware } from './types/middleware'
import Config from './services/config'
import createLogger, { Logger } from 'ilp-logger'
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

const ownAddress = 'test.connie'

export default class App {

  config: Config
  log: Logger
  connector: Connector
  stats: Stats
  alerts: Alerts
  packetCacheMap: Map<string, PacketCache>
  rateLimitBucketMap: Map<string, TokenBucket>
  throughputBucketsMap: Map<string, {incomingBucket?: TokenBucket, outgoingBucket?: TokenBucket}>

  constructor (opts?: object) {

    this.log = createLogger('app')
    this.config = new Config()
    this.connector = new Connector()
    this.stats = new Stats()
    this.alerts = new Alerts()
    this.packetCacheMap = new Map()
    this.rateLimitBucketMap = new Map()
    this.throughputBucketsMap = new Map()

    try {
      if (opts) {
        this.config.loadFromOpts(opts)
      } else {
        this.config.loadFromEnv()
      }
    } catch (err) {
      if (err.name === 'InvalidJsonBodyError') {
        this.log.warn('config validation error.')
        err.debugPrint(this.log.warn.bind(this.log))
        this.log.error('invalid configuration, shutting down.')
        throw new Error('failed to initialize due to invalid configuration.')
      }

      throw err
    }

    if (this.config.ilpAddress) this.connector.setOwnAddress(this.config.ilpAddress)

  }

  /*
  * Loop through configured accounts and instantiate the specified endpoint and middleware. Add this to the connector.
  */
  async start () {
    this.log.info('starting connector')
    for (let account of Object.keys(this.config.accounts)) {
      const { assetScale, assetCode, relation, deduplicate, maxPacketAmount, throughput, rateLimit, endpoint } = this.config.accounts[account]
      const peerInfo: PeerInfo = {
        id: account,
        assetScale,
        assetCode,
        relation,
        deduplicate,
        maxPacketAmount,
        throughput,
        rateLimit
      }
      const middleware = this._createMiddleware(peerInfo)
      const endpointDefinition = typeof(endpoint) === 'object' ? endpoint : require(endpoint) // TODO update when implementations of endpoint are released
      const endpointInstance = typeof(endpoint) === 'object' ? endpoint : new endpointDefinition()
      await this.connector.addPeer(peerInfo, endpointInstance, middleware)
    }
  }

  private _createMiddleware (peerInfo: PeerInfo): Middleware[] {
    const middleware: Middleware[] = []
    const disabledMiddleware = this.config.disableMiddleware ? this.config.disableMiddleware : []

    const rateLimitBucket: TokenBucket = createRateLimitBucketForPeer(peerInfo)
    const throughputBuckets = createThroughputLimitBucketsForPeer(peerInfo)
    const cache = new PacketCache(peerInfo.deduplicate || {}) // Could make this a global cache to allow for checking across different peers?

    this.packetCacheMap.set(peerInfo.id, cache)
    this.throughputBucketsMap.set(peerInfo.id, throughputBuckets)
    this.rateLimitBucketMap.set(peerInfo.id, rateLimitBucket)

    // TODO add balance middleware
    middleware.push(new ExpireMiddleware())
    if (!disabledMiddleware.includes('errorHandler')) middleware.push(new ErrorHandlerMiddleware({ getOwnIlpAddress: () => ownAddress }))
    if (!disabledMiddleware.includes('rateLimit')) middleware.push(new RateLimitMiddleware({ stats: this.stats, bucket: rateLimitBucket }))
    if (!disabledMiddleware.includes('maxPacketAmount')) middleware.push(new MaxPacketAmountMiddleware({ maxPacketAmount: peerInfo.maxPacketAmount }))
    if (!disabledMiddleware.includes('throughput')) middleware.push(new ThroughputMiddleware(throughputBuckets))
    if (!disabledMiddleware.includes('deduplicate')) middleware.push(new DeduplicateMiddleware({ cache }))
    if (!disabledMiddleware.includes('validateFulfillment')) middleware.push(new ValidateFulfillmentMiddleware())
    if (!disabledMiddleware.includes('stats')) middleware.push(new StatsMiddleware({ stats: this.stats, peerInfo }))
    if (!disabledMiddleware.includes('alert')) middleware.push(new AlertMiddleware({ createAlert: (triggeredBy: string, message: string) => this.alerts.createAlert(peerInfo.id, triggeredBy, message) }))

    return middleware
  }

}
