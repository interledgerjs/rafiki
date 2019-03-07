import { log } from './winston'
import { Middleware, setPipelineReader } from './types/middleware'
import Connector from './connector'
import { PeerInfo, Rule } from './types/peer'
import { ErrorHandlerMiddleware } from './middleware/business/error-handler'
import { RateLimitMiddleware, createRateLimitBucketForPeer } from './middleware/business/rate-limit'
import { MaxPacketAmountMiddleware } from './middleware/business/max-packet-amount'
import { ThroughputMiddleware, createThroughputLimitBucketsForPeer } from './middleware/business/throughput'
import { DeduplicateMiddleware, PacketCache, PacketCacheOptions } from './middleware/business/deduplicate'
import { ExpireMiddleware } from './middleware/business/expire'
import { ValidateFulfillmentMiddleware } from './middleware/business/validate-fulfillment'
import { StatsMiddleware } from './middleware/business/stats'
import { AlertMiddleware, Alerts } from './middleware/business/alert'
import TokenBucket from './lib/token-bucket'
import Stats from './services/stats'
import { ReduceExpiryMiddleware } from './middleware/protocol/reduce-expiry'
import { Http2Server, createServer } from 'http2'
import { Http2Endpoint } from './endpoints/http2'

import { serializeIlpReject, IlpReply, IlpPrepare } from 'ilp-packet'
import * as pathToRegexp from 'path-to-regexp'
import { pipeline, RequestHandler } from './types/request-stream'
import { Endpoint } from './types/endpoint'

const logger = log.child({ component: 'App' })
export interface AppOptions {
  ilpAddress: string
  port: number,
}

export interface EndpointInfo {
  type: string,
  url: string
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
  endpointsMap: Map<string, Http2Endpoint>
  businessRulesMap: Map<string, Middleware[]>

  constructor (opts: AppOptions) {

    this.connector = new Connector()
    this.stats = new Stats()
    this.alerts = new Alerts()
    this.packetCacheMap = new Map()
    this.rateLimitBucketMap = new Map()
    this.throughputBucketsMap = new Map()
    this.endpointsMap = new Map()
    this.businessRulesMap = new Map()

    this.connector.setOwnAddress(opts.ilpAddress)

    this.port = opts.port
    this.server = createServer()

    // Could possible bind on the incoming sessions (TCP connection) rather than streams
    // TODO Cleanup
    this.server.on('stream', async (stream, headers, flags) => {
      const method = headers[':method']
      const path = headers[':path']

      logger.silly('incoming http2 stream', { path, method })
      const peerId = this._matchPathToPeerId(path)

      if (peerId && method === 'POST') {
        // Get the incoming data
        let chunks: Array<Buffer> = []
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })
        stream.on('end', async () => {
          let packet = Buffer.concat(chunks)
          let response = await this.handleIncomingPacket(peerId, packet)
          stream.end(response)
        })
        stream.on('error', (error) => logger.error('stream error', { error }))
      } else {
        stream.respond({ ':status': 404 })
        stream.end()
      }
    })
  }

  async start () {
    logger.info('starting connector....')
    logger.info('starting HTTP2 server on port ' + this.port)
    this.server.listen(this.port)
  }

  // Find endpoint and drop packet onto it if found
  private async handleIncomingPacket (peerId: string, data: Buffer) {
    const endpoint = this.endpointsMap.get(peerId)
    if (endpoint) {
      return endpoint.handlePacket(data)
    } else {
      logger.info('endpoint not found for incoming packet', { peerId })
      return serializeIlpReject({
        code: 'T01', // TODO probably should be another error code
        data: Buffer.from(''),
        message: 'Peer not found',
        triggeredBy: this.connector.getOwnAddress() || ''
      })
    }
  }

  async addPeer (peerInfo: PeerInfo, endpointInfo: EndpointInfo) {
    logger.info('adding new peer: ' + peerInfo.id, { peerInfo, endpointInfo })
    const middlewareInstances: Middleware[] = this._createMiddleware(peerInfo)
    this.businessRulesMap.set(peerInfo.id, middlewareInstances)
    const endpoint = this.createEndpoint(endpointInfo)

    // create incoming and outgoing pipelines for business rules
    const combinedMiddleware = pipeline(...middlewareInstances)
    const sendOutgoing = middlewareInstances.length > 0 ? setPipelineReader('outgoing', combinedMiddleware, endpoint.sendOutgoingRequest.bind(endpoint)) : endpoint.sendOutgoingRequest.bind(endpoint)

    // wrap endpoint and middleware pipelines in something that looks like an endpoint<IlpPrepare, IlpReply>
    const wrapperEndpoint = {
      sendOutgoingRequest: async (request: IlpPrepare, sentCallback?: () => void): Promise<IlpReply> => {
        return sendOutgoing(request)
      },
      setIncomingRequestHandler: (handler: RequestHandler<IlpPrepare, IlpReply>): Endpoint<IlpPrepare, IlpReply> => {
        const sendIncoming = middlewareInstances.length > 0 ? setPipelineReader('incoming', combinedMiddleware, handler) : handler
        endpoint.setIncomingRequestHandler(sendIncoming)
        return wrapperEndpoint
      }
    }
    await this.connector.addPeer(peerInfo, wrapperEndpoint, false)

    middlewareInstances.forEach(mw => mw.startup())

    this.endpointsMap.set(peerInfo.id, endpoint)
  }

  async removePeer (peerId: string) {
    logger.info('Removing peer: ' + peerId, { peerId })
    const endpoint = this.endpointsMap.get(peerId)
    if (endpoint) {
      endpoint.close()
    }
    this.packetCacheMap.delete(peerId)
    this.rateLimitBucketMap.delete(peerId)
    this.throughputBucketsMap.delete(peerId)
    this.endpointsMap.delete(peerId)
    await this.connector.removePeer(peerId)
    Array.from(this.getRules(peerId)).forEach(rule => rule.shutdown())
  }

  /**
   * Tells connector to remove its peers and clears the stored packet caches and token buckets. The connector is responsible for shutting down the peer's middleware.
   */
  async shutdown () {
    logger.info('Shutting down app...')
    this.connector.getPeerList().forEach((peerId: string) => this.removePeer(peerId))
    Array.from(this.packetCacheMap.values()).forEach(cache => cache.dispose())
    this.packetCacheMap.clear()
    this.rateLimitBucketMap.clear()
    this.throughputBucketsMap.clear()
    this.server.close()
    this.endpointsMap.clear()
  }

  getRules (peerId: string): Middleware[] {
    return this.businessRulesMap.get(peerId) || []
  }

  private createEndpoint (endpointInfo: EndpointInfo) {
    const { type, url } = endpointInfo
    switch (type) {
      case ('http'):
        logger.info('adding new Http2 endpoint for peer', { endpointInfo })
        return new Http2Endpoint({ url })
      default:
        logger.warn('Endpoint type specified not support', { endpointInfo })
        throw new Error('Endpoint type not supported')
    }
  }

  private _createMiddleware (peerInfo: PeerInfo): Middleware[] {
    // Global/Config might be needed
    const globalMinExpirationWindow = 35000
    const globalMaxHoldWindow = 35000

    const instantiateMiddleware = (rule: Rule): Middleware => {
      switch (rule.name) {
        case('errorHandler'):
          return new ErrorHandlerMiddleware({ getOwnIlpAddress: () => this.connector.getOwnAddress() || '' })
        case('expire'):
          return new ExpireMiddleware()
        case('reduceExpiry'):
          return new ReduceExpiryMiddleware({ minIncomingExpirationWindow: 0.5 * globalMinExpirationWindow, minOutgoingExpirationWindow: 0.5 * globalMinExpirationWindow, maxHoldWindow: globalMaxHoldWindow })
        case('rateLimit'):
          const rateLimitBucket: TokenBucket = createRateLimitBucketForPeer(peerInfo)
          this.rateLimitBucketMap.set(peerInfo.id, rateLimitBucket)
          return new RateLimitMiddleware({ peerInfo, stats: this.stats, bucket: rateLimitBucket })
        case('maxPacketAmount'):
          return new MaxPacketAmountMiddleware({ maxPacketAmount: rule.maxPacketAmount })
        case('throughput'):
          const throughputBuckets = createThroughputLimitBucketsForPeer(peerInfo)
          this.throughputBucketsMap.set(peerInfo.id, throughputBuckets)
          return new ThroughputMiddleware(throughputBuckets)
        case('deduplicate'):
          const cache = new PacketCache(rule as PacketCacheOptions || {}) // Could make this a global cache to allow for checking across different peers?
          this.packetCacheMap.set(peerInfo.id, cache)
          return new DeduplicateMiddleware({ cache })
        case('validateFulfillment'):
          return new ValidateFulfillmentMiddleware()
        case('stats'):
          return new StatsMiddleware({ stats: this.stats, peerInfo })
        case('alert'):
          return new AlertMiddleware({ createAlert: (triggeredBy: string, message: string) => this.alerts.createAlert(peerInfo.id, triggeredBy, message) })
        default:
          throw new Error('Middleware identifier undefined')
      }
    }

    return peerInfo.rules.map(instantiateMiddleware)
  }

  private _matchPathToPeerId (path: string | undefined) {
    if (!path) return null
    let re = pathToRegexp('/ilp/:peerId')
    const result = re.exec(path)
    return result ? result[1] : null
  }

}
