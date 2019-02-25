import { Router as RoutingTable, RouteManager } from 'ilp-router'
import { pipeline } from './types/channel'
import { Endpoint } from './types/endpoint'
import { IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Middleware, setPipelineReader } from './types/middleware'
import { PeerInfo, Relation } from './types/peer'
import { CcpMiddleware, CcpMiddlewareServices } from './middleware/protocol/ccp'
import { IldcpMiddleware, IldcpMiddlewareServices } from './middleware/protocol/ildcp'
import { HeartbeatMiddleware } from './middleware/business/heartbeat'
import { Peer } from 'ilp-router/build/ilp-route-manager/peer'

const { codes } = Errors
export default class Connector {
  routingTable: RoutingTable = new RoutingTable()
  routeManager: RouteManager = new RouteManager(this.routingTable)
  outgoingIlpPacketHandlerMap: Map<string, (packet: IlpPrepare) => Promise<IlpReply> > = new Map()
  address?: string
  peerMiddleware: Map<string, Middleware[]> = new Map()

  // Need to add self and globalPrefix to routing
  constructor () {
    this.addSelfPeer()
    // TODO refactor when RouteManager is finished
    // const ownAddress = this.accounts.getOwnAddress()
    // this.localRoutes.set(ownAddress, {
    //   nextHop: '',
    //   path: [],
    //   auth: hmac(this.routingSecret, ownAddress)
    // })

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

  async addPeer (peerInfo: PeerInfo, endpoint: Endpoint<IlpPrepare, IlpReply>, middleware: Middleware[]) {

    this.routeManager.addPeer(peerInfo.id, peerInfo.relation) // TODO refactor when RouteManager is finished

    const protocolMiddleware = [
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
    ]

    this.peerMiddleware.set(selfPeerId, [...protocolMiddleware])
    const combinedMiddleware = pipeline(...protocolMiddleware)
    const sendIncoming = setPipelineReader('incoming', combinedMiddleware, this.sendIlpPacket.bind(this))
    const sendOutgoing = setPipelineReader('outgoing', combinedMiddleware, (request: IlpPrepare): Promise<IlpReply> => {
      try {
        return endpoint.sendOutgoingRequest(request)
      } catch (e) {

        if (!e.ilpErrorCode) {
          e.ilpErrorCode = codes.T01_PEER_UNREACHABLE
        }

        e.message = 'failed to send packet: ' + e.message

        throw e
      }
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

  getPeerMiddleware (id: string): Middleware[] | undefined {
    return this.peerMiddleware.get(id)
  }

  getPeerList () {
    return this.routeManager.getPeerList()
  }
}
