import { Router as RoutingTable, RouteManager } from 'ilp-router'
import { pipeline } from './types/channel'
import { Endpoint } from './types/endpoint'
import { IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Middleware, setPipelineReader } from './types/middleware'
import { PeerInfo, Relation } from './types/peer'
import { CcpMiddleware, CcpMiddlewareServices } from './middleware/protocol/ccp'
import { IldcpMiddleware, IldcpMiddlewareServices } from './middleware/protocol/ildcp'
import { HeartbeatMiddleware } from './middleware/business/heartbeat'

const { codes } = Errors
export default class Connector {
  routingTable: RoutingTable = new RoutingTable()
  routeManager: RouteManager = new RouteManager(this.routingTable)
  outgoingIlpPacketHandlerMap: Map<string, (packet: IlpPrepare) => Promise<IlpReply> > = new Map()
  address?: string
  peerMiddleware: Map<string, Middleware[]> = new Map()

/**
 * Connects the business middleware and protocol middleware (for this connector implementation: heartbeat, Ildcp and ccp) into a duplex pipeline.
 * The write section of the incoming channel is then attached to the endpoint and the read section to sendIlpPacket. The write section of the outgoing
 * channel is attached to the send function of the endpoint. The outgoing channel is then stored for future use. Should the endpoint be unable to send
 * a packet, the peer's route is removed from the routing table. The entire middleware stack is started up.
 *
 * @param peerInfo Peer information
 * @param endpoint An endpoint that communicates using IlpPrepares and IlpReplies
 * @param middleware The business logic middleware that is to be added to the protocol middleware for the peer
 */
  async addPeer (peerInfo: PeerInfo, endpoint: Endpoint<IlpPrepare, IlpReply>, middleware: Middleware[]) {

    this.routeManager.addPeer(peerInfo.id, peerInfo.relation) // TODO refactor when RouteManager is finished

    const protocolMiddleware = [
      new HeartbeatMiddleware({
        endpoint,
        onSuccessfulHeartbeat: () => this.routeManager.addPeer(peerInfo.id, peerInfo.relation), // TODO refactor when RouteManager is finished
        onFailedHeartbeat: () => this.routeManager.removePeer(peerInfo.id) // TODO refactor when RouteManager is finished
      }),
      new CcpMiddleware({
        // isSender: peerInfo.sendRoutes,
        // isReceiver: peerInfo.receiveRoutes,
        peerId: peerInfo.id,
        forwardingRoutingTable: this.routingTable.getForwardingRoutingTable(),
        getPeerRelation: this.getPeerRelation.bind(this),
        getOwnAddress: () => this.getOwnAddress(),
        addRoute: this.routeManager.addRoute.bind(this),
        removeRoute: this.routeManager.removeRoute.bind(this)
      } as CcpMiddlewareServices),
      new IldcpMiddleware({
        getPeerInfo: () => peerInfo,
        getOwnAddress: this.getOwnAddress.bind(this),
        getPeerAddress: () => this.getPeerAddress(peerInfo.id)
      } as IldcpMiddlewareServices)
    ]

    this.peerMiddleware.set(peerInfo.id, [...middleware, ...protocolMiddleware])
    const combinedMiddleware = pipeline(...middleware, ...protocolMiddleware)
    const sendIncoming = setPipelineReader('incoming', combinedMiddleware, this.sendIlpPacket.bind(this))
    const sendOutgoing = setPipelineReader('outgoing', combinedMiddleware, (request: IlpPrepare): Promise<IlpReply> => {
      try {
        return endpoint.sendOutgoingRequest(request)
      } catch (e) {
        this.routingTable.removeRoute(this.getPeerAddress(peerInfo.id)) // TODO refactor when RouteManager is finished

        if (!e.ilpErrorCode) {
          e.ilpErrorCode = codes.T01_PEER_UNREACHABLE
        }

        e.message = 'failed to send packet: ' + e.message

        throw e
      }
    })
    endpoint.setIncomingRequestHandler((request: IlpPrepare) => {
      return sendIncoming(request)
    })
    this.outgoingIlpPacketHandlerMap.set(peerInfo.id, sendOutgoing)

    middleware.forEach(mw => mw.startup())
    protocolMiddleware.forEach(mw => mw.startup())

    this.routeManager.addRoute({
      peer: peerInfo.id,
      prefix: this.getPeerAddress(peerInfo.id),
      path: []
    })
  }

  async removePeer (id: string): Promise<void> {
    const peerMiddleware = this.getPeerMiddleware(id)
    if (peerMiddleware) peerMiddleware.forEach(mw => mw.shutdown())
    this.peerMiddleware.delete(id)
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
  }

  getOwnAddress (): string | undefined {
    return this.address
  }

  getPeerAddress (id: string): string {
    return this.getOwnAddress() + '.' + id
  }

  getPeerRelation (peerId: string): Relation | undefined {
    const peer = this.routeManager.getPeer(peerId)
    if (peer) {
      return peer.getRelation()
    } else {
      console.log('peer not found')
    }

  }

  getPeerMiddleware (id: string): Middleware[] | undefined {
    return this.peerMiddleware.get(id)
  }

  getPeerList () {
    return Array.from(this.outgoingIlpPacketHandlerMap.keys())
  }
}
