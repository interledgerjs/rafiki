import { Router as RoutingTable, PeerController } from 'ilp-router'
import { Endpoint } from './types/endpoint'
import { IlpPrepare, IlpReply, IlpFulfill, serializeIlpPrepare, deserializeIlpFulfill } from 'ilp-packet'
import { constructPipelines, constructMiddlewarePipeline } from '../src/lib/middleware'
import Middleware from './types/middleware'
import { PeerInfo } from './types/peer'
import CcpMiddleware, { CcpMiddlewareServices } from './middleware/protocol/ccp'
import { Ildcp as IldcpMiddleware, IldcpMiddlewareServices } from './middleware/protocol/ildcp'
import { serializeCcpResponse, deserializeCcpRouteControlRequest, deserializeCcpRouteUpdateRequest } from 'ilp-protocol-ccp'

const ownAddress: string = 'test.connie'
export default class Connector {
  routingTable: RoutingTable = new RoutingTable()
  peerControllerMap: Map<string, PeerController> = new Map()
  outgoingIlpPacketHandlerMap: Map<string, (packet: IlpPrepare) => Promise<IlpReply> > = new Map()

  async addPeer (peerInfo: PeerInfo, endpoint: Endpoint<IlpPrepare, IlpReply>, businessMiddleware: { [key: string]: Middleware }) {
    const protocolMiddleware = {
      'ccp': new CcpMiddleware({
        handleCcpRouteControl: async (packet: IlpPrepare) => this._handleCcpRouteControl(packet, peerInfo.id),
        handleCcpRouteUpdate: async (packet: IlpPrepare) => this._handleCcpRouteUpdate(packet, peerInfo.id)
      } as CcpMiddlewareServices),
      'ildcp': new IldcpMiddleware({
        getPeerInfo: () => peerInfo,
        getOwnAddress: () => ownAddress,
        getPeerAddress: () => ownAddress + '.' + peerInfo.id
      } as IldcpMiddlewareServices)
    }

    const middleware = Object.assign(businessMiddleware, protocolMiddleware)
    const pipelines = await constructPipelines(middleware)
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, this.sendIlpPacket.bind(this))
    const outgoingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, endpoint.request.bind(endpoint))

    endpoint.handler = incomingIlpPacketHandler
    this.outgoingIlpPacketHandlerMap.set(peerInfo.id, outgoingIlpPacketHandler)

    this.routingTable.addRoute(peerInfo.id, {
      prefix: ownAddress + '.' + peerInfo.id,
      path: []
    })

    const opts = {
      peerId: peerInfo.id,
      sendData: outgoingIlpPacketHandler,
      getPeerRelation: (peerId: string) => peerInfo.relation,
      forwardingRoutingTable: this.routingTable.getForwardingRoutingTable()
    }
    const peerController = new PeerController(opts)
    this.peerControllerMap.set(peerInfo.id, peerController)
  }

  async sendIlpPacket (packet: IlpPrepare): Promise<IlpReply> {
    const { destination } = packet
    const nextHop = this.routingTable.nextHop(destination)
    const handler = this.outgoingIlpPacketHandlerMap.get(nextHop)

    if (!handler) throw new Error(`No handler set for ${nextHop}`)

    return handler(packet)
  }

  getPeer (id: string): PeerController {
    const peerController = this.peerControllerMap.get(id)
    if (!peerController) throw new Error(`Cannot find peer with id=${id}`)

    return peerController
  }

  private async _handleCcpRouteControl (packet: IlpPrepare, peerId: string): Promise<IlpReply> {
    const peerController = this.getPeer(peerId)

    peerController.handleRouteControl(deserializeCcpRouteControlRequest(serializeIlpPrepare(packet)))

    return deserializeIlpFulfill(serializeCcpResponse())
  }
  private async _handleCcpRouteUpdate (packet: IlpPrepare, peerId: string): Promise<IlpReply> {
    const peerController = this.getPeer(peerId)

    const changedPrefixes = peerController.handleRouteUpdate(deserializeCcpRouteUpdateRequest(serializeIlpPrepare(packet)))

    // Loop over all peerControllers routes and determine who is the best person to send the new routes,
    // else remove routes from routing table

    return deserializeIlpFulfill(serializeCcpResponse())
  }

}
