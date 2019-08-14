import { IncomingRoute, RouteManager, Router as RoutingTable } from 'ilp-routing'
import Knex from 'knex'
import { fetch as ildcpFetch } from 'ilp-protocol-ildcp'
import { Relation, RelationWeights, PeerInfo } from '../../types'
import { log } from '../../winston'
import { PeerNotFoundError } from '../../errors/peer-not-found-error'
import { CcpRouteControlRequest, CcpRouteUpdateRequest, CcpRouteControlResponse, CcpRouteUpdateResponse } from 'ilp-protocol-ccp'
import { CcpSender, CcpSenderService } from '../../protocols/ccp/ccp-sender'
import { CcpReceiver, CcpReceiverService } from '../../protocols/ccp/ccp-receiver'
import { PeerService } from '../peers'
import { Connector } from '.'
import { SELF_PEER_ID } from '../../constants'
import { Route } from '../../models/Route';

const logger = log.child({ component: 'in-memory-connector' })

export class InMemoryConnector implements Connector {
  _routingTable: RoutingTable = new RoutingTable()
  _routeManager: RouteManager = new RouteManager(this._routingTable)
  _ccpSenders: CcpSenderService = new CcpSenderService()
  _ccpReceivers: CcpReceiverService = new CcpReceiverService()

  constructor (private _peers: PeerService) {
    this._routeManager.addPeer(SELF_PEER_ID, 'local')
    // TODO: Make Peer service an emitter?
    // _peers.on('peer', (peer: PeerInfo) => {
    //   const { id, relation, protocols: { ccp }} = peer
    //   this.addPeer(id, relation, ccp.weighting, ccp.isSender, ccp.isReceiver).catch(e => {
    //     logger.error(e)
    //   })
    // })
  }

  public async load (knex: Knex) {
    const routes = await Route.query(knex)
    routes.forEach(entry => {
      this.addRoute(entry.peerId, entry.targetPrefix)
    })
  }

  public async handleRouteControl (peerId: string, request: CcpRouteControlRequest): Promise<CcpRouteControlResponse> {
    return this._ccpSenders.getOrThrow(peerId).handleRouteControl(request)
  }

  public async handleRouteUpdate (peerId: string, request: CcpRouteUpdateRequest): Promise<CcpRouteUpdateResponse> {
    return this._ccpReceivers.getOrThrow(peerId).handleRouteUpdate(request)
  }

  public async addPeer (peerId: string, relation: Relation, weight: number, isSender = false, isReceiver = false) {
    logger.info('adding peer', { peerId, relation })
    this._routeManager.addPeer(peerId, relation)

    if (isReceiver) {
      logger.verbose('creating CCP receiver for peer', { peerId })
      const receiver = new CcpReceiver({
        peerId,
        sendData: async (data: Buffer) => {
          return this._peers.getOrThrow(peerId).client.send(data)
        },
        addRoute: (route: IncomingRoute) => { this._routeManager.addRoute(route) },
        removeRoute:  (peerId: string, prefix: string) => { this._routeManager.removeRoute(peerId, prefix) },
        getRouteWeight
      })
      this._ccpReceivers.set(peerId, receiver)
      await receiver.sendRouteControl()
    }

    if (isSender) {
      logger.verbose('creating CCP sender for peer', { peerId })
      const sender = new CcpSender({
        peerId,
        sendData: async (data: Buffer) => {
          return this._peers.getOrThrow(peerId).client.send(data)
        },
        forwardingRoutingTable: this._routingTable.getForwardingRoutingTable(),
        getOwnAddress: () => this.getOwnAddress(),
        getPeerRelation: (peerId: string): Relation => {
          const peer = this._routeManager.getPeer(peerId)
          if (!peer) throw new PeerNotFoundError(peerId)
          return peer.getRelation()
        },
        routeExpiry: 0, // TODO: Configurable
        routeBroadcastInterval: 10000 // TODO: Configurable
      })
      this._ccpSenders.set(peerId, sender)
    }

    if (relation === 'parent') {
      const { clientAddress } = await ildcpFetch(async (data: Buffer): Promise<Buffer> => {
        return this._peers.getOrThrow(peerId).client.send(data)
      })
      if (clientAddress === 'unknown') {
        const e = new Error('Failed to get ILDCP address from parent.')
        logger.error(e)
        throw e
      }
      logger.info('received ILDCP address from parent', { address: clientAddress })
      this.addOwnAddress(clientAddress, weight || RelationWeights.parent)
    }

    // only add route for children. The rest are populated from route update.
    if (relation === 'child') {
      const address = this.getOwnAddress() + '.' + peerId
      this._routeManager.addRoute({
        peer: peerId,
        prefix: address,
        path: []
      })
    }
  }

  public async removePeer (id: string): Promise<void> {
    logger.info('removing peer', { peerId: id })
    this._routeManager.removePeer(id)
    this._ccpReceivers.delete(id)
    const sender = this._ccpSenders.get(id)
    if (sender) {
      sender.stop()
      this._ccpSenders.delete(id)
    }
  }

  public getPeerForAddress (destination: string): string {
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

  public getPeerList () {
    return this._routeManager.getPeerList()
  }

  public addRoute (peerId: string, prefix: string) {
    logger.info('adding route', { prefix, peerId })
    const peer = this._routeManager.getPeer(peerId)
    if (!peer) {
      const msg = 'Cannot add route for unknown peerId=' + peerId
      logger.error(msg)
      throw new Error(msg)
    }
    this._routeManager.addRoute({
      peer: peerId,
      prefix: prefix,
      path: []
    })
  }

  public removeRoute (peerId: string, prefix: string) {
    this._routeManager.removeRoute(peerId, prefix)
  }
}

function getRouteWeight (peerId: string): number {
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
