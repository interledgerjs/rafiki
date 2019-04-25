import { log } from './winston'
import { Rule, setPipelineReader } from './types/rule'
import { Connector } from './connector'
import { PeerInfo, RuleConfig } from './types/peer'
import { ErrorHandlerRule } from './rules/error-handler'
import { RateLimitRule, createRateLimitBucketForPeer } from './rules/rate-limit'
import { MaxPacketAmountRule } from './rules/max-packet-amount'
import { ThroughputRule, createThroughputLimitBucketsForPeer } from './rules/throughput'
import { DeduplicateRule, PacketCache, PacketCacheOptions } from './rules/deduplicate'
import { ExpireRule } from './rules/expire'
import { ValidateFulfillmentRule } from './rules/validate-fulfillment'
import { StatsRule } from './rules/stats'
import { AlertRule, Alerts } from './rules/alert'
import { TokenBucket } from './lib/token-bucket'
import { Stats } from './services/stats'
import { ReduceExpiryRule } from './rules/reduce-expiry'
import { EndpointInfo, EndpointManager } from './endpoints'

import { IlpReply, IlpPrepare } from 'ilp-packet'
import { pipeline, RequestHandler } from './types/request-stream'
import { Endpoint } from './types/endpoint'
import { createServer, Http2Server } from 'http2'
import { PluginEndpoint } from './legacy/plugin-endpoint'

const logger = log.child({ component: 'App' })

export interface AppOptions {
  ilpAddress?: string
  http2Port: number,
}

/**
 * An instance of a Rafiki app
 */
export class App {

  private _packetCacheMap: Map<string, PacketCache>
  private _rateLimitBucketMap: Map<string, TokenBucket>
  private _throughputBucketsMap: Map<string, { incomingBucket?: TokenBucket, outgoingBucket?: TokenBucket }>
  private _http2Server: Http2Server
  private _http2ServerPort: number
  private _endpointManager: EndpointManager
  private _businessRulesMap: Map<string, Rule[]>

  /**
   * Instantiates an http2 server which handles posts to ilp/:peerId and passes the packet on to the appropriate peer's endpoint.
   * @param opts Options for the application
   */
  constructor (opts: AppOptions) {

    this.connector = new Connector()
    this.stats = new Stats()
    this.alerts = new Alerts()
    this._packetCacheMap = new Map()
    this._rateLimitBucketMap = new Map()
    this._throughputBucketsMap = new Map()
    this._businessRulesMap = new Map()

    this.connector.setOwnAddress(opts.ilpAddress || 'unknown')

    this._http2ServerPort = opts.http2Port
    this._http2Server = createServer()
    this._endpointManager = new EndpointManager({
      http2Server: this._http2Server
    })

  }

  public async start () {
    logger.info('starting connector....')
    logger.info('starting HTTP2 server on port ' + this._http2ServerPort)
    this._http2Server.listen(this._http2ServerPort)
  }

  public connector: Connector
  public stats: Stats
  public alerts: Alerts

  /**
   * Instantiates the business rules specified in the peer information and attaches it to a pipeline. Creates a wrapper endpoint which connects the pipeline to
   * the original endpoint. This is then passed into the connector's addPeer. The business rules are then started and the original endpoint stored. Tells connector
   * to inherit address from the peer if it is a parent and you do not have an address.
   * @param peerInfo Peer information
   * @param endpoint An endpoint that communicates using IlpPrepares and IlpReplies
   */
  public async addPeer (peerInfo: PeerInfo, endpointInfo: EndpointInfo) {
    logger.info('adding new peer: ' + peerInfo.id, { peerInfo, endpointInfo })
    const rulesInstances: Rule[] = this._createRules(peerInfo)
    this._businessRulesMap.set(peerInfo.id, rulesInstances)
    logger.info('creating new endpoint for peer', { endpointInfo })
    const endpoint = this._endpointManager.createEndpoint(peerInfo.id, endpointInfo)

    // create incoming and outgoing pipelines for business rules
    const combinedRule = pipeline(...rulesInstances)
    const sendOutgoing = rulesInstances.length > 0 ? setPipelineReader('outgoing', combinedRule, endpoint.sendOutgoingRequest.bind(endpoint)) : endpoint.sendOutgoingRequest.bind(endpoint)

    // wrap endpoint and middleware pipelines in something that looks like an endpoint<IlpPrepare, IlpReply>
    const wrapperEndpoint = {
      sendOutgoingRequest: async (request: IlpPrepare, sentCallback?: () => void): Promise<IlpReply> => {
        return sendOutgoing(request)
      },
      setIncomingRequestHandler: (handler: RequestHandler<IlpPrepare, IlpReply>): Endpoint<IlpPrepare, IlpReply> => {
        const sendIncoming = rulesInstances.length > 0 ? setPipelineReader('incoming', combinedRule, handler) : handler
        endpoint.setIncomingRequestHandler(sendIncoming)
        return wrapperEndpoint
      }
    }

    const haveAddress = this.connector.getOwnAddress() !== 'unknown'
    let inheritAddress = false
    if (peerInfo.relation === 'parent' && !haveAddress) {
      inheritAddress = true
    } else if (peerInfo.relation === 'parent' && haveAddress) {
      logger.warn(`Already have an address. Will not inherit from peerId=${peerInfo.id}.`)
    }

    await this.connector.addPeer(peerInfo, wrapperEndpoint, inheritAddress) // TODO: add logic to determine whether address should be inherited.

    if (endpoint instanceof PluginEndpoint) {
      endpoint.connect().catch(() => logger.error('Plugin endpoint failed to connect'))
    }

    rulesInstances.forEach(rule => rule.startup())
  }

  public async removePeer (peerId: string) {
    logger.info('Removing peer: ' + peerId, { peerId })
    await this._endpointManager.closeEndpoints(peerId)
    this._packetCacheMap.delete(peerId)
    this._rateLimitBucketMap.delete(peerId)
    this._throughputBucketsMap.delete(peerId)
    await this.connector.removePeer(peerId)
    Array.from(this.getRules(peerId)).forEach(rule => rule.shutdown())
  }

  /**
   * Tells connector to remove its peers and clears the stored packet caches and token buckets. The connector is responsible for shutting down the peer's protocols.
   */
  public async shutdown () {
    logger.info('Shutting down app...')
    this.connector.getPeerList().forEach((peerId: string) => this.removePeer(peerId))
    Array.from(this._packetCacheMap.values()).forEach(cache => cache.dispose())
    this._packetCacheMap.clear()
    this._rateLimitBucketMap.clear()
    this._throughputBucketsMap.clear()
    this._endpointManager.closeAll()
    this._http2Server.close()
  }

  public getRules (peerId: string): Rule[] {
    return this._businessRulesMap.get(peerId) || []
  }

  /**
   * Creates the business rules specified in the peer information. Custom rules should be added to the list.
   * @param peerInfo Peer information
   * @returns An array of rules
   */
  private _createRules (peerInfo: PeerInfo): Rule[] {

    logger.verbose('Creating rules for peer', { peerInfo })

    // Global/Config might be needed
    const globalMinExpirationWindow = 1500
    const globalMaxHoldWindow = 35000

    const instantiateRule = (rule: RuleConfig): Rule => {
      switch (rule.name) {
        case('errorHandler'):
          return new ErrorHandlerRule({ getOwnIlpAddress: () => this.connector.getOwnAddress() || '' })
        case('expire'):
          return new ExpireRule()
        case('reduceExpiry'):
          return new ReduceExpiryRule({ minIncomingExpirationWindow: 0.5 * globalMinExpirationWindow, minOutgoingExpirationWindow: 0.5 * globalMinExpirationWindow, maxHoldWindow: globalMaxHoldWindow })
        case('rateLimit'):
          const rateLimitBucket: TokenBucket = createRateLimitBucketForPeer(peerInfo)
          this._rateLimitBucketMap.set(peerInfo.id, rateLimitBucket)
          return new RateLimitRule({ peerInfo, stats: this.stats, bucket: rateLimitBucket })
        case('maxPacketAmount'):
          return new MaxPacketAmountRule({ maxPacketAmount: rule.maxPacketAmount })
        case('throughput'):
          const throughputBuckets = createThroughputLimitBucketsForPeer(peerInfo)
          this._throughputBucketsMap.set(peerInfo.id, throughputBuckets)
          return new ThroughputRule(throughputBuckets)
        case('deduplicate'):
          const cache = new PacketCache(rule as PacketCacheOptions || {}) // Could make this a global cache to allow for checking across different peers?
          this._packetCacheMap.set(peerInfo.id, cache)
          return new DeduplicateRule({ cache })
        case('validateFulfillment'):
          return new ValidateFulfillmentRule()
        case('stats'):
          return new StatsRule({ stats: this.stats, peerInfo })
        case('alert'):
          return new AlertRule({ createAlert: (triggeredBy: string, message: string) => this.alerts.createAlert(peerInfo.id, triggeredBy, message) })
        default:
          throw new Error('Rule identifier undefined')
      }
    }

    return peerInfo.rules.map(instantiateRule)
  }

}
