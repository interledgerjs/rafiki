import { IncomingRoute, RouteManager, Router as RoutingTable } from 'ilp-routing'
import { pipeline } from './types/request-stream'
import { Endpoint, PeerInfo, ProtocolConfig, Relation, RelationWeights, Rule, setPipelineReader } from './types'
import { Errors, IlpPrepare, IlpReply } from 'ilp-packet'
import { CcpProtocol } from './protocols/ccp'
import { EchoProtocol, IldcpProtocol } from './protocols'
import { PeerUnreachableError } from 'ilp-packet/dist/src/errors'
import { log } from './winston'
import { PeerNotFoundError } from './errors/peer-not-found-error'
import compose from 'koa-compose'
import { IlpMiddleWare, IlpState } from './koa/ilp-packet-middleware'
import { ParameterizedContext } from 'koa'

const logger = log.child({ component: 'connector' })

const { codes } = Errors

export class Connector {
  routingTable: RoutingTable = new RoutingTable()
  routeManager: RouteManager = new RouteManager(this.routingTable)
  outgoing: IlpMiddleWare
  ccp: CcpProtocol
  ildcp: IldcpProtocol
  echo: EchoProtocol

  constructor () {

    this.ccp = new CcpProtocol({
      isSender: protocol.sendRoutes || false,
      isReceiver: protocol.receiveRoutes || false,
      peerId: peerInfo.id,
      forwardingRoutingTable: this.routingTable.getForwardingRoutingTable(),
      getPeerRelation: this.getPeerRelation.bind(this),
      getOwnAddress: this.getOwnAddress.bind(this),
      addRoute: (route: IncomingRoute) => { this.routeManager.addRoute(route) } ,
      removeRoute: (peerId: string, prefix: string) => { this.routeManager.removeRoute(peerId, prefix) } ,
      getRouteWeight: this.calculateRouteWeight.bind(this)
    })

    this.ildcp = new IldcpProtocol({
      getPeerInfo: () => peerInfo,
      getOwnAddress: this.getOwnAddress.bind(this)
    })

    this.echo = new EchoProtocol({ getOwnAddress: this.getOwnAddress.bind(this), minMessageWindow: 1500 })

    const _incoming = compose([this.ildcp.incoming, this.ccp.incoming])
    const _outgoing = compose([this.echo.outgoing, this.ccp.outgoing, this.ildcp.outgoing])

    function sendOutgoing (ctx: ParameterizedContext<IlpState>) {
      _outgoing(ctx, async () => {
        await this.outgoing(ctx)
      })
    }

    this.addSelfPeer()
  }

/**
 * Instantiates and connects the protocol middleware (specfied in peer info) into a duplex pipeline. Connects the supplied endpoint to the pipeline
 * and the pipeline to the sendIlpPacket function. Asks the ildcp protocol to get the address peer is a parent. Registers the peer
 * with the route manager and only adds it as a route if the peer is a child. The protocol middleware is also started up.
 *
 * @param peerInfo Peer information
 * @param endpoint An endpoint that communicates using IlpPrepares and IlpReplies
 */
  async addPeer (peerInfo: PeerInfo) {
    logger.info('adding peer', { peerInfo })
    this.routeManager.addPeer(peerInfo.id, peerInfo.relation)

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
    this.routeManager.removePeer(id)
  }

  public getNextHop (destination: string): string {
    return this.routingTable.nextHop(destination)
  }

  async sendOutgoingRequest (peer: string, packet: IlpPrepare): Promise<IlpReply> {
    // TODO: Fix this
    const handler = this.outgoingIlpPacketHandlerMap.get(to)

    if (!handler) {
      logger.error('Handler not found for specified nextHop', { to })
      throw new PeerNotFoundError(to)
    }

    logger.silly('sending outgoing ILP Packet', { to })

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
    const peer = this.routeManager.getPeer('self')
    return peer
      ? peer['routes']['prefixes'].sort((a: string, b: string) => peer['routes']['items'][b]['weight'] - peer['routes']['items'][a]['weight']) 
      : []
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

  getPeerList () {
    return this.routeManager.getPeerList()
  }

}
