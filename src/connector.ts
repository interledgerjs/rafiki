import { Router as RoutingTable, RouteManager } from 'ilp-router'
import { pipeline } from './types/channel'
import { Endpoint } from './types/endpoint'
import { IlpPrepare, IlpReply, IlpFulfill, serializeIlpPrepare, deserializeIlpFulfill, Errors } from 'ilp-packet'
import { Middleware, setPipelineReader } from './types/middleware'
import { PeerInfo, Relation } from './types/peer'
import { CcpMiddleware, CcpMiddlewareServices } from './middleware/protocol/ccp'
import { IldcpMiddleware, IldcpMiddlewareServices } from './middleware/protocol/ildcp'
import { serializeCcpResponse, deserializeCcpRouteControlRequest, deserializeCcpRouteUpdateRequest } from 'ilp-protocol-ccp'
import { HeartbeatMiddleware } from './middleware/business/heartbeat'

const { codes } = Errors
export default class Connector {
  routingTable: RoutingTable = new RoutingTable()
  routeManager: RouteManager = new RouteManager(this.routingTable)
  outgoingIlpPacketHandlerMap: Map<string, (packet: IlpPrepare) => Promise<IlpReply> > = new Map()
  address?: string

  async addPeer (peerInfo: PeerInfo, endpoint: Endpoint<IlpPrepare, IlpReply>, middleware: Middleware[]) {

    this.routeManager.addPeer(peerInfo.id, peerInfo.relation) // TODO refactor when RouteManager is finished

    const protocolMiddleware = pipeline(
      new HeartbeatMiddleware({
        endpoint,
        onSuccessfulHeartbeat: () => this.routeManager.addPeer(peerInfo.id, peerInfo.relation), // TODO refactor when RouteManager is finished
        onFailedHeartbeat: () => this.routeManager.removePeer(peerInfo.id) // TODO refactor when RouteManager is finished
      }),
      new CcpMiddleware({
        isSender: peerInfo.sendRoutes,
        isReceiver: peerInfo.receiveRoutes,
        peerId: peerInfo.id,
        forwardingRoutingTable: this.routingTable.getForwardingRoutingTable(),
        getPeerRelation: this.getPeerRelation.bind(this),
        getOwnAddress: () => this.getOwnAddress()
      } as CcpMiddlewareServices),
      new IldcpMiddleware({
        getPeerInfo: () => peerInfo,
        getOwnAddress: this.getOwnAddress.bind(this),
        getPeerAddress: () => this.getPeerAddress(peerInfo.id)
      } as IldcpMiddlewareServices)
    )

    const combinedMiddleware = pipeline(...middleware, protocolMiddleware)
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

    this.routeManager.addRoute({
      peer: peerInfo.id,
      prefix: this.getPeerAddress(peerInfo.id),
      path: []
    })
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
}
