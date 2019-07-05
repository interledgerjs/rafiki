import { log } from './winston'
import { Rule, setPipelineReader } from './types/rule'
import { Connector } from './connector'
import { PeerInfo, RuleConfig, PeerRelation } from './types/peer'
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
import { EndpointInfo, EndpointManager, AuthFunction } from './endpoints'

import { IlpReply, IlpPrepare, isReject } from 'ilp-packet'
import { pipeline, RequestHandler } from './types/request-stream'
import { Endpoint } from './types/endpoint'
import { createServer, Http2Server } from 'http2'
import { PluginEndpoint } from './legacy/plugin-endpoint'
import { Config } from './services'
import { Balance, JSONBalanceSummary, InMemoryBalance } from './types'
import { MIN_INT_64, MAX_INT_64, STATIC_CONDITION } from './constants'
import { BalanceRule } from './rules'
import { PeerNotFoundError } from './errors/peer-not-found-error'
import { Peer } from './models/Peer'
import Knex from 'knex'
import { Model } from 'objection'

const logger = log.child({ component: 'App' })

/**
 * An instance of a Rafiki app
 */
export class App {

  private _packetCacheMap: Map<string, PacketCache>
  private _rateLimitBucketMap: Map<string, TokenBucket>
  private _throughputBucketsMap: Map<string, { incomingBucket?: TokenBucket, outgoingBucket?: TokenBucket }>
  private _http2Server: Http2Server
  private _endpointManager: EndpointManager
  private _businessRulesMap: Map<string, Rule[]>
  private _balanceMap: Map<string, Balance>
  private _config: Config
  private _knex: Knex

  /**
   * Instantiates an http2 server which handles posts to ilp/:peerId and passes the packet on to the appropriate peer's endpoint.
   * @param opts Options for the application
   */
  constructor (opts: Config, authService: AuthFunction, knex: Knex) {

    this.connector = new Connector()
    this.stats = new Stats()
    this.alerts = new Alerts()
    this._packetCacheMap = new Map()
    this._rateLimitBucketMap = new Map()
    this._throughputBucketsMap = new Map()
    this._businessRulesMap = new Map()
    this._balanceMap = new Map()
    this._config = opts

    this.connector.routingTable.setGlobalPrefix(this._config.env === 'production' ? 'g' : 'test')

    this._http2Server = createServer()
    this._endpointManager = new EndpointManager({
      http2Server: this._http2Server,
      authService: authService
    })

    this._knex = knex
  }

  public async start () {
    logger.info('starting connector....')
    logger.info('starting HTTP2 server on port ' + this._config.http2ServerPort)

    if (this._config.ilpAddress !== 'unknown') this.connector.addOwnAddress(this._config.ilpAddress) // config loads ilpAddress as 'unknown' by default

    await this.loadFromDataStore()
    this._http2Server.listen(this._config.http2ServerPort)
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

    await this.connector.addPeer(peerInfo, wrapperEndpoint)

    if (endpoint instanceof PluginEndpoint) {
      logger.info('Plugin endpoint connecting')
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

  public getBalance = (peerId: string): JSONBalanceSummary => {
    const balance = this._balanceMap.get(peerId)

    if (!balance) {
      throw new Error(`Cannot find balance for peerId=${peerId}`)
    }

    return balance.toJSON()
  }

  public getBalances = () => {
    let balances = {}
    this._balanceMap.forEach((value, key) => balances[key] = value.toJSON())
    return balances
  }

  public updateBalance = (peerId: string, amountDiff: bigint, scale: number): void => {
    const balance = this._balanceMap.get(peerId)

    if (!balance) {
      throw new PeerNotFoundError(peerId)
    }

    const scaleDiff = balance.scale - scale
    // TODO: update to check whether scaledAmountDiff is an integer
    if (scaleDiff < 0) {
      logger.warn('Could not adjust balance due to scale differences', { amountDiff, scale })
      return
    }

    const scaleRatio = Math.pow(10, scaleDiff)
    const scaledAmountDiff = amountDiff * BigInt(scaleRatio)

    balance.update(scaledAmountDiff)
  }

  public forwardSettlementMessage = async (to: string, message: Buffer): Promise<Buffer> => {
    logger.debug('Forwarding settlement message', { to, message: message.toString() })
    const packet: IlpPrepare = {
      amount: '0',
      destination: 'peer.settle',
      executionCondition: STATIC_CONDITION,
      expiresAt: new Date(Date.now() + 60000),
      data: message
    }

    const ilpReply = await this.connector.sendOutgoingRequest(to, packet)
    if (isReject(ilpReply)) {
      throw new Error('IlpPacket to settlement engine was rejected')
    }

    return ilpReply.data
  }

  public addRoute (targetPrefix: string, peerId: string) {
    logger.info('adding route', { targetPrefix, peerId })
    const peer = this.connector.routeManager.getPeer(peerId)
    if (!peer) {
      const msg = 'Cannot add route for unknown peerId=' + peerId
      logger.error(msg)
      throw new Error(msg)
    }
    this.connector.routeManager.addRoute({
      peer: peerId,
      prefix: targetPrefix,
      path: []
    })
  }

  /**
   * Creates the business rules specified in the peer information. Custom rules should be added to the list.
   * @param peerInfo Peer information
   * @returns An array of rules
   */
  private _createRules (peerInfo: PeerInfo): Rule[] {

    logger.verbose('Creating rules for peer', { peerInfo })

    const instantiateRule = (rule: RuleConfig): Rule => {
      switch (rule.name) {
        case('errorHandler'):
          return new ErrorHandlerRule({ getOwnIlpAddress: () => this.connector.getOwnAddress() || '' })
        case('expire'):
          return new ExpireRule()
        case('reduceExpiry'):
          return new ReduceExpiryRule({ minIncomingExpirationWindow: 0.5 * this._config.minExpirationWindow, minOutgoingExpirationWindow: 0.5 * this._config.minExpirationWindow, maxHoldWindow: this._config.maxHoldWindow })
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
        case('balance'):
          if (!rule.minimum && !rule.maximum) {
            logger.warn(`(!!!) balance bounds NOT defined for peer, this peer can spend UNLIMITED funds peerId=${peerInfo.id}`)
          }
          if (rule.settlement && !rule.settlement.url) {
            logger.error('config error for peerId=' + peerInfo.id + '. Url for settlement engine needs to be a string')
            throw new Error('config error for peerId=' + peerInfo.id + '. Url for settlement engine needs to be a string')
          }
          const minimum = rule.minimum ? BigInt(rule.minimum) : MIN_INT_64
          const maximum = rule.maximum ? BigInt(rule.maximum) : MAX_INT_64
          const settleTo = rule.settlement && rule.settlement.settleTo ? BigInt(rule.settlement.settleTo) : BigInt(0)
          const settleThreshold = rule.settlement && rule.settlement.settleThreshold ? BigInt(rule.settlement.settleThreshold) : BigInt(0)
          const url = rule.settlement && rule.settlement.url ? rule.settlement.url : ''
          const settlementInfo = rule.settlement ? { url, settleTo, settleThreshold } : undefined
          const initialBalance = rule.initialBalance ? BigInt(rule.initialBalance) : 0n
          logger.info('initializing in-memory balance for peer', { peerId: peerInfo.id, minimum: minimum.toString(), maximum: maximum.toString(), initialBalance: initialBalance.toString() })
          const balance = new InMemoryBalance({ initialBalance, minimum, maximum, scale: peerInfo.assetScale }) // In future can get from a balance service
          this._balanceMap.set(peerInfo.id, balance)
          return new BalanceRule({ peerInfo, stats: this.stats, balance }, settlementInfo)
        default:
          throw new Error('Rule identifier undefined')
      }
    }
    return peerInfo.rules.map(instantiateRule)
  }

  private loadFromDataStore = async () => {
    const peers = await Peer.query(this._knex).eager('[rules,protocols,endpoint]')
    peers.forEach(peer => {
      const rules = peer['rules'].map((rule: RuleConfig) => {
        return {
          name: rule.name
        }
      })
      const protocols = peer['protocols'].map((protocol: any) => {
        return {
          name: protocol.name
        }
      })
      const peerInfo: PeerInfo = {
        id: peer.id,
        assetCode: peer.assetCode,
        assetScale: peer.assetScale,
        relation: peer.relation as PeerRelation,
        rules: rules,
        protocols: protocols
      }
      const endpointInfo: EndpointInfo = {
        type: peer['endpoint'].type,
        httpOpts: peer['endpoint'].options
      }
      this.addPeer(peerInfo, endpointInfo)
    })
  }
}
