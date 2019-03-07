import { Router as RoutingTable, RouteManager, IncomingRoute } from 'ilp-routing'
import { pipeline } from './types/request-stream'
import { Endpoint } from './types/endpoint'
import { IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Rule, setPipelineReader } from './types/rule'
import { PeerInfo, Relation, ProtocolConfig } from './types/peer'
import { CcpProtocol } from './protocols/ccp'
import { IldcpProtocol } from './protocols/ildcp'
import { EchoProtocol } from './protocols/echo'
import { PeerUnreachableError } from 'ilp-packet/dist/src/errors'

const { codes } = Errors
export default class Connector {
  routingTable: RoutingTable = new RoutingTable()
  routeManager: RouteManager = new RouteManager(this.routingTable)
  outgoingIlpPacketHandlerMap: Map<string, (packet: IlpPrepare) => Promise<IlpReply> > = new Map()
  address?: string
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
 * Connects the business middleware and protocol middleware (for this connector implementation: heartbeat, Ildcp and ccp) into a duplex pipeline.
 * The write section of the incoming channel is then attached to the endpoint and the read section to sendIlpPacket. The write section of the outgoing
 * channel is attached to the send function of the endpoint. The outgoing channel is then stored for future use. Should the endpoint be unable to send
 * a packet, the peer's route is removed from the routing table. The entire middleware stack is started up. It will get the address from the ILDCP
 * middleware if the inheritAddressFrom input is true.
 *
 * @param peerInfo Peer information
 * @param endpoint An endpoint that communicates using IlpPrepares and IlpReplies
 * @param middleware The business logic middleware that is to be added to the protocol middleware for the peer
 */
  async addPeer (peerInfo: PeerInfo, endpoint: Endpoint<IlpPrepare, IlpReply>, inheritAddressFrom: boolean = false) {
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

    if (inheritAddressFrom) {
      const ildcpMiddleware = protocolMiddleware.find(mw => mw.constructor.name === 'IldcpMiddleware')
      this.setOwnAddress(await (ildcpMiddleware as IldcpProtocol).getAddressFrom(endpoint))
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

    if (!handler) throw new Error(`No handler set for ${nextHop}`)

    return handler(packet)
  }

  setOwnAddress (address: string) {
    this.address = address
    this.routingTable.setOwnAddress(address) // Tricky: This needs to be here for now to append to path of forwarding routing table
    this.routeManager.addRoute({
      prefix: address,
      peer: 'self',
      path: [],
      weight: 500
    })
  }

  getOwnAddress (): string | undefined {
    return this.address
  }

  getPeerAddress (id: string): string {
    return this.getOwnAddress() + '.' + id
  }

  private addSelfPeer () {
    const selfPeerId = 'self'
    this.routeManager.addPeer(selfPeerId, 'local')
    const protocolMiddleware = [
      new EchoProtocol({ getOwnAddress: this.getOwnAddress.bind(this), minMessageWindow: 30000 }) // TODO need to fix the hard coded value
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
          weight += 400
          break
        case('peer'):
          weight += 300
          break
        case('child'):
          weight += 200
          break
        case('local'):
          weight += 100
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
      console.log('peer not found')
    }
  }

  getPeerRules (id: string): Rule[] | undefined {
    return this.peerRules.get(id)
  }

  getPeerList () {
    return this.routeManager.getPeerList()
  }

  private _createProtocols (peerInfo: PeerInfo): Rule[] {

    const instantiateProtocol = (protocol: ProtocolConfig): Rule => {
      switch (protocol.name) {
        case('ccp'):
          return new CcpProtocol({
            isSender: protocol.sendRoutes || false,
            isReceiver: protocol.receiveRoutes || false,
            peerId: peerInfo.id,
            forwardingRoutingTable: this.routingTable.getForwardingRoutingTable(),
            getPeerRelation: this.getPeerRelation.bind(this),
            getOwnAddress: () => this.getOwnAddress() as string,
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
          throw new Error(`Protocol ${protocol.name} undefined`)
      }
    }

    return peerInfo.protocols.map(instantiateProtocol)
  }
}
