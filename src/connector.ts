import { Router as RoutingTable, RouteManager, IncomingRoute } from 'ilp-routing'
import { pipeline } from './types/request-stream'
import { Endpoint } from './types/endpoint'
import { IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Rule, setPipelineReader } from './types/rule'
import { PeerInfo, Relation, ProtocolConfig, RelationWeights } from './types/peer'
import { CcpProtocol } from './protocols/ccp'
import { IldcpProtocol } from './protocols/ildcp'
import { EchoProtocol } from './protocols/echo'
import { PeerUnreachableError } from 'ilp-packet/dist/src/errors'
import { log } from './winston'

const logger = log.child({ component: 'connector' })

const { codes } = Errors

export class Connector {
  routingTable: RoutingTable = new RoutingTable()
  routeManager: RouteManager = new RouteManager(this.routingTable)
  outgoingIlpPacketHandlerMap: Map<string, (packet: IlpPrepare) => Promise<IlpReply> > = new Map()
  peerRules: Map<string, Rule[]> = new Map()

  constructor () {

    this.addSelfPeer()

    // TODO add default route config
    // let defaultRoute = this.config.defaultRoute
    // if (defaultRoute === 'auto') {
    //   defaultRoute = localAccounts.filter(id => this.accounts.getInfo(id).relation === 'parent')[0]
    // }
    // if (defaultRoute) {
    //   const globalPrefix = this.getGlobalPrefix()
    //   this.localRoutes.set(globalPrefix, {
    //     nextHop: defaultRoute,
    //     path: [],
    //     auth: hmac(this.routingSecret, globalPrefix)
    //   })
    // }
  }

/**
 * Instantiates and connects the protocol middleware (specfied in peer info) into a duplex pipeline. Connects the supplied endpoint to the pipeline
 * and the pipeline to the sendIlpPacket function. Asks the ildcp protocol to get the address peer is a parent. Registers the peer
 * with the route manager and only adds it as a route if the peer is a child. The protocol middleware is also started up.
 *
 * @param peerInfo Peer information
 * @param endpoint An endpoint that communicates using IlpPrepares and IlpReplies
 */
  async addPeer (peerInfo: PeerInfo, endpoint: Endpoint<IlpPrepare, IlpReply>) {
    logger.info('adding peer', { peerInfo })
    this.routeManager.addPeer(peerInfo.id, peerInfo.relation)
    const protocolMiddleware = this._createProtocols(peerInfo)
    this.peerRules.set(peerInfo.id, protocolMiddleware)
    const combinedMiddleware = pipeline(...protocolMiddleware)

    const sendOutgoingRequest = (request: IlpPrepare): Promise<IlpReply> => {
      try {
        return endpoint.sendOutgoingRequest(request)
      } catch (e) {

        if (!e.ilpErrorCode) {
          e.ilpErrorCode = codes.T01_PEER_UNREACHABLE
        }

        e.message = 'failed to send packet: ' + e.message

        throw e
      }
    }

    const sendIncoming = protocolMiddleware.length > 0 ? setPipelineReader('incoming', combinedMiddleware, this.sendIlpPacket.bind(this)) : this.sendIlpPacket.bind(this)
    const sendOutgoing = protocolMiddleware.length > 0 ? setPipelineReader('outgoing', combinedMiddleware, sendOutgoingRequest) : sendOutgoingRequest
    endpoint.setIncomingRequestHandler((request: IlpPrepare) => {
      return sendIncoming(request)
    })
    this.outgoingIlpPacketHandlerMap.set(peerInfo.id, sendOutgoing)

    protocolMiddleware.forEach(mw => mw.startup())

    if (peerInfo.relation === 'parent') {
      const ildcpProtocol = protocolMiddleware.find(mw => mw.constructor.name === 'IldcpProtocol')
      if (!ildcpProtocol) {
        logger.error('Ildcp protocol needs to be added in order to inherit address.')
        throw new Error('Ildcp protocol needs to be added in order to inherit address.')
      }
      this.addOwnAddress(await (ildcpProtocol as IldcpProtocol).getAddressFrom(endpoint), peerInfo.relationWeight || RelationWeights.parent)
    }

    // only add route for children. The rest are populated from route update.
    if (peerInfo.relation === 'child') {
      const ildcpProtocol = peerInfo.protocols.filter(protocol => protocol.name === 'ildcp')[0]
      const address = this.getOwnAddress() + '.' + (ildcpProtocol && ildcpProtocol.ilpAddressSegment || peerInfo.id)
      this.routeManager.addRoute({
        peer: peerInfo.id,
        prefix: address,
        path: []
      })
    }
  }

  async removePeer (id: string): Promise<void> {
    logger.info('removing peer', { peerId: id })
    const peerMiddleware = this.getPeerRules(id)
    if (peerMiddleware) peerMiddleware.forEach(mw => mw.shutdown())
    this.peerRules.delete(id)
    this.outgoingIlpPacketHandlerMap.delete(id)
    this.routeManager.removePeer(id)
  }
  async sendIlpPacket (packet: IlpPrepare): Promise<IlpReply> {
    const { destination } = packet
    const nextHop = this.routingTable.nextHop(destination)
    const handler = this.outgoingIlpPacketHandlerMap.get(nextHop)

    if (!handler) {
      logger.error('Handler not found for specified nextHop', { nextHop })
      throw new Error(`No handler set for ${nextHop}`)
    }

    logger.silly('sending outgoing ILP Packet', { destination, nextHop })

    return handler(packet)
  }

  addOwnAddress (address: string, weight: number = 500) {
    logger.info('setting own address', { address })
    this.routingTable.setOwnAddress(address) // Tricky: This needs to be here for now to append to path of forwarding routing table
    this.routeManager.addRoute({
      prefix: address,
      peer: 'self',
      path: [],
      weight
    })
  }

  getOwnAddress (): string {
    const addresses = this.getOwnAddresses()
    return addresses.length > 0 ? addresses[0] : 'unknown'
  }

  /**
   * @returns string[] Array of addresses ordered by highest weighting first.
   */
  getOwnAddresses (): string[] {
    const selfPeer = this.routeManager.getPeer('self')

    return selfPeer ? selfPeer['routes']['prefixes'].sort((a: string, b: string) => selfPeer['routes']['items'][b]['weight'] - selfPeer['routes']['items'][a]['weight']) : []
  }

  removeAddress (address: string): void {
    this.routeManager.removeRoute('self', address)
  }

  /**
   * The 'self' peer  represents the connector and handles all packets addressed to it. There is no endpoint at the end of the pipeline and
   * only the Echo protocol is applied to the pipeline.
   */
  private addSelfPeer () {
    const selfPeerId = 'self'
    this.routeManager.addPeer(selfPeerId, 'local')
    const protocolMiddleware = [
      new EchoProtocol({ getOwnAddress: this.getOwnAddress.bind(this), minMessageWindow: 1500 }) // TODO need to fix the hard coded value
    ]

    this.peerRules.set(selfPeerId, [...protocolMiddleware])
    const combinedMiddleware = pipeline(...protocolMiddleware)
    const sendIncoming = setPipelineReader('incoming', combinedMiddleware, this.sendIlpPacket.bind(this))
    const sendOutgoing = setPipelineReader('outgoing', combinedMiddleware, (request: IlpPrepare): Promise<IlpReply> => {

      // Should throw an error as you are the intended recipient
      throw new PeerUnreachableError('cant forward on packet addressed to self')
    })

    this.outgoingIlpPacketHandlerMap.set(selfPeerId, sendOutgoing)

    protocolMiddleware.forEach(mw => mw.startup())
  }

  /**
   * Calculates the weighting for a given peer and path length
   * Relation: Parent:
   * @param peerId id for peer
   */
  calculateRouteWeight (peerId: string): number {
    let weight: number = 0
    const peer = this.routeManager.getPeer(peerId)
    if (peer) {
      switch (peer.getRelation()) {
        case('parent'):
          weight += RelationWeights.parent
          break
        case('peer'):
          weight += RelationWeights.peer
          break
        case('child'):
          weight += RelationWeights.child
          break
        case('local'):
          weight += RelationWeights.local
          break
      }
    }
    return weight
  }

  getPeerRelation (peerId: string): Relation | undefined {
    const peer = this.routeManager.getPeer(peerId)
    if (peer) {
      return peer.getRelation()
    } else {
      logger.verbose('peer not found to determine peer relation', { peerId })
    }
  }

  getPeerRules (id: string): Rule[] | undefined {
    return this.peerRules.get(id)
  }

  getPeerList () {
    return this.routeManager.getPeerList()
  }

  private _createProtocols (peerInfo: PeerInfo): Rule[] {

    logger.verbose('creating protocols for peer', { peerInfo })

    const instantiateProtocol = (protocol: ProtocolConfig): Rule => {
      switch (protocol.name) {
        case('ccp'):
          return new CcpProtocol({
            isSender: protocol.sendRoutes || false,
            isReceiver: protocol.receiveRoutes || false,
            peerId: peerInfo.id,
            forwardingRoutingTable: this.routingTable.getForwardingRoutingTable(),
            getPeerRelation: this.getPeerRelation.bind(this),
            getOwnAddress: () => this.getOwnAddress(),
            addRoute: (route: IncomingRoute) => { this.routeManager.addRoute(route) } ,
            removeRoute: this.routeManager.removeRoute.bind(this),
            getRouteWeight: this.calculateRouteWeight.bind(this)
          })
        case('ildcp'):
          return new IldcpProtocol({
            getPeerInfo: () => peerInfo,
            getOwnAddress: this.getOwnAddress.bind(this)
          })
        default:
          logger.error(`Protocol ${protocol.name} is not supported`, { peerInfo })
          throw new Error(`Protocol ${protocol.name} undefined`)
      }
    }

    return peerInfo.protocols.map(instantiateProtocol)
  }
}
