import { IncomingRoute, RouteManager, Router as RoutingTable } from 'ilp-routing'
import { fetch as ildcpFetch } from 'ilp-protocol-ildcp'
import { PeerInfo, Relation, RelationWeights } from './types'
import { CcpProtocol } from './protocols/ccp'
import { EchoProtocol, IldcpProtocol } from './protocols'
import { log } from './winston'
import { PeerNotFoundError } from './errors/peer-not-found-error'
import { IlpMiddleWare } from './koa/ilp-packet-middleware'
import { AppServices } from './services'
import compose from 'koa-compose'

export const SELF_PEER_ID = 'self'

const logger = log.child({ component: 'connector' })

export class Connector {
  _routingTable: RoutingTable = new RoutingTable()
  _routeManager: RouteManager = new RouteManager(this._routingTable)
  _middleware: IlpMiddleWare
  _ccp: CcpProtocol
  _ildcp: IldcpProtocol
  _echo: EchoProtocol

  constructor (private _services: AppServices) {
    this._ccp = new CcpProtocol(_services, {
      // TODO: Does this return an object reference from a method call? Should we be calling it each time?
      forwardingRoutingTable: this._routingTable.getForwardingRoutingTable(),
      getPeerRelation: (peerId: string) => this.getPeerRelation(peerId),
      getOwnAddress: () => this.getOwnAddress(),
      addRoute: (route: IncomingRoute) => { this._routeManager.addRoute(route) } ,
      removeRoute: (peerId: string, prefix: string) => { this._routeManager.removeRoute(peerId, prefix) } ,
      getRouteWeight: (peerId: string) => this._calculateRouteWeight(peerId)
    })
    this._ildcp = new IldcpProtocol(_services, {
      getOwnAddress: () => this.getOwnAddress()
    })
    this._echo = new EchoProtocol(_services, {
      minMessageWindow: 1500 // TODO: Configure
    })

    this._middleware = compose([
      this._ildcp.incoming,
      this._ccp.incoming,
      this._echo.outgoing,
      this._ccp.outgoing,
      this._ildcp.outgoing
    ])

    this._addSelfPeer()
  }

  public middleware () {
    return this._middleware
  }

  public async addPeer (peerInfo: PeerInfo) {
    logger.info('adding peer', { peerInfo })
    this._routeManager.addPeer(peerInfo.id, peerInfo.relation)

    if (peerInfo.relation === 'parent') {
      const { clientAddress } = await ildcpFetch(async (data: Buffer): Promise<Buffer> => {
        const client = this._services.clients.getOrThrow(peerInfo.id)
        return client.send(data)
      })
      if (clientAddress === 'unknown') {
        const e = new Error('Failed to get ILDCP address from parent.')
        logger.error(e)
        throw e
      }
      logger.info('received ILDCP address from parent', { address: clientAddress })
      this.addOwnAddress(clientAddress, peerInfo.relationWeight || RelationWeights.parent)
    }

    // only add route for children. The rest are populated from route update.
    if (peerInfo.relation === 'child') {
      const { ildcp } = peerInfo.protocols
      const segment = (ildcp && ildcp.ilpAddressSegment) ? ildcp.ilpAddressSegment : peerInfo.id
      const address = this.getOwnAddress() + '.' + segment
      this._routeManager.addRoute({
        peer: peerInfo.id,
        prefix: address,
        path: []
      })
    }

    // Create sender/receiver if necessary
    await this._ccp.addPeer(peerInfo)
  }

  public async removePeer (id: string): Promise<void> {
    logger.info('removing peer', { peerId: id })
    this._routeManager.removePeer(id)
    await this._ccp.removePeer(id)
  }

  public getNextHop (destination: string): string {
    return this._routingTable.nextHop(destination)
  }

  public addOwnAddress (address: string, weight: number = 500) {
    logger.info('setting own address', { address })
    this._routingTable.setOwnAddress(address) // Tricky: This needs to be here for now to append to path of forwarding routing table
    this._routeManager.addRoute({
      prefix: address,
      peer: SELF_PEER_ID,
      path: [],
      weight
    })
  }

  public getOwnAddress (): string {
    const addresses = this.getOwnAddresses()
    return addresses.length > 0 ? addresses[0] : 'unknown'
  }

  /**
   * @returns string[] Array of addresses ordered by highest weighting first.
   */
  public getAddresses (peerId: string): string[] {
    const peer = this._routeManager.getPeer(peerId)
    return peer
      ? peer['routes']['prefixes'].sort((a: string, b: string) => {
        return peer['routes']['items'][b]['weight'] - peer['routes']['items'][a]['weight']
      })
      : []
  }

  /**
   * @returns string[] Array of addresses ordered by highest weighting first.
   */
  public getOwnAddresses (): string[] {
    return this.getAddresses(SELF_PEER_ID)
  }

  public removeOwnAddress (address: string): void {
    this._routeManager.removeRoute(SELF_PEER_ID, address)
  }

  public getPeerRelation (peerId: string): Relation {
    const peer = this._routeManager.getPeer(peerId)
    if (!peer) throw new PeerNotFoundError(peerId)
    return peer.getRelation()
  }

  public getPeerList () {
    return this._routeManager.getPeerList()
  }

  /**
   * The 'self' peer  represents the connector and handles all packets addressed to it.
   *
   * There is no endpoint at the end of the pipeline and
   * only the Echo protocol is applied to the pipeline.
   */
  private _addSelfPeer () {
    const selfPeerId = SELF_PEER_ID
    this._routeManager.addPeer(selfPeerId, 'local')
  }

  /**
   * Calculates the weighting for a given peer and path length
   * Relation: Parent:
   * @param peerId id for peer
   */
  private _calculateRouteWeight (peerId: string): number {
    let weight: number = 0
    const peer = this._routeManager.getPeer(peerId)
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

}
