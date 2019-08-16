import { IncomingRoute, RouteManager, Router as RoutingTable } from 'ilp-routing'
import Knex from 'knex'
import { fetch as ildcpFetch } from 'ilp-protocol-ildcp'
import { Relation, RelationWeights, PeerInfo } from '../../types'
import { log } from '../../logger'
import { PeerNotFoundError } from '../../errors'
import { CcpRouteControlRequest, CcpRouteUpdateRequest, CcpRouteControlResponse, CcpRouteUpdateResponse } from 'ilp-protocol-ccp'
import { CcpSender, CcpSenderService } from './ccp-sender'
import { CcpReceiver, CcpReceiverService } from './ccp-receiver'
import { PeerService } from '../peers'
import { Router, getRouteWeight } from '.'
import { SELF_PEER_ID } from '../../constants'
// import { Route } from '../../../../temp/models/Route'
import { sendToPeer } from '../client'

const logger = log.child({ component: 'in-memory-router' })

export interface ImMemoryRouterConfig {
  globalPrefix?: string,
  ilpAddress?: string
}

export class InMemoryRouter implements Router {
  _routingTable: RoutingTable = new RoutingTable()
  _routeManager: RouteManager = new RouteManager(this._routingTable)
  _ccpSenders: CcpSenderService = new CcpSenderService()
  _ccpReceivers: CcpReceiverService = new CcpReceiverService()

  constructor (private _peers: PeerService, { globalPrefix, ilpAddress }: ImMemoryRouterConfig) {

    // Setup the `self` peer
    this._routeManager.addPeer(SELF_PEER_ID, 'local')
    this._routingTable.setGlobalPrefix(globalPrefix || 'test')
    if (ilpAddress) {
      this._addOwnAddress(ilpAddress)
    }

    // Added
    this._peers.added.subscribe(async (peer: PeerInfo) => {
      const routingWeight = peer.relationWeight || 0
      await this._addPeer(peer.id, peer.relation, routingWeight, peer.isCcpSender, peer.isCcpReceiver)
    })

    // Updated
    this._peers.updated.subscribe(async (peer: PeerInfo) => {
      logger.info('Peer has updated')
      return
    })

    // Removed
    this._peers.deleted.subscribe(async (peerId: string) => {
      await this._removePeer(peerId)
    })

  }

  public async load (knex: Knex) {
    // const routes = await Route.query(knex)
    // routes.forEach(entry => {
    //   this._addRoute(entry.peerId, entry.targetPrefix)
    // })
  }

  public async handleRouteControl (peerId: string, request: CcpRouteControlRequest): Promise<CcpRouteControlResponse> {
    return this._ccpSenders.getOrThrow(peerId).handleRouteControl(request)
  }

  public async handleRouteUpdate (peerId: string, request: CcpRouteUpdateRequest): Promise<CcpRouteUpdateResponse> {
    return this._ccpReceivers.getOrThrow(peerId).handleRouteUpdate(request)
  }

  public getPeerForAddress (destination: string): string {
    return this._routingTable.nextHop(destination)
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

  public getRoutingTable () {
    return this._routingTable.getRoutingTable().toJSON()
  }

  private async _addPeer (peerId: string, relation: Relation, weight: number, isSender = false, isReceiver = false) {
    logger.info('adding peer', { peerId, relation })
    this._routeManager.addPeer(peerId, relation)

    if (isReceiver) {
      // TODO This needs to be cleaned up.
      logger.info('creating CCP receiver for peer', { peerId })
      const receiver = new CcpReceiver({
        peerId,
        sendData: async (data: Buffer) => {
          return sendToPeer(peerId, data, this._peers)
        },
        addRoute: (route: IncomingRoute) => { this._routeManager.addRoute(route) },
        removeRoute:  (peerId: string, prefix: string) => { this._routeManager.removeRoute(peerId, prefix) },
        getRouteWeight
      })
      this._ccpReceivers.set(peerId, receiver)
    }

    if (isSender) {
      // TODO This needs to be cleaned up.
      logger.info('creating CCP sender for peer', { peerId })
      const sender = new CcpSender({
        peerId,
        sendData: async (data: Buffer) => {
          return sendToPeer(peerId, data, this._peers)
        },
        forwardingRoutingTable: this._routingTable.getForwardingRoutingTable(),
        getOwnAddress: () => this._getOwnAddress(),
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
        return sendToPeer(peerId, data, this._peers)
      })
      if (clientAddress === 'unknown') {
        const e = new Error('Failed to get ILDCP address from parent.')
        logger.error(e)
        throw e
      }
      logger.info('received ILDCP address from parent', { address: clientAddress })
      this._addOwnAddress(clientAddress, weight || RelationWeights.parent)
    }

    // only add route for children. The rest are populated from route update.
    if (relation === 'child') {
      const address = this._getOwnAddress() + '.' + peerId
      this._routeManager.addRoute({
        peer: peerId,
        prefix: address,
        path: []
      })
    }
  }

  private async _removePeer (id: string): Promise<void> {
    logger.info('removing peer', { peerId: id })
    this._routeManager.removePeer(id)
    this._ccpReceivers.delete(id)
    const sender = this._ccpSenders.get(id)
    if (sender) {
      sender.stop()
      this._ccpSenders.delete(id)
    }
  }

  private _addOwnAddress (address: string, weight: number = 500) {
    logger.info('setting own address', { address })
    this._routingTable.setOwnAddress(address) // Tricky: This needs to be here for now to append to path of forwarding routing table
    this._routeManager.addRoute({
      prefix: address,
      peer: SELF_PEER_ID,
      path: [],
      weight
    })
  }

  private _getOwnAddress (): string {
    const addresses = this.getAddresses(SELF_PEER_ID)
    return addresses.length > 0 ? addresses[0] : 'unknown'
  }

  private _removeOwnAddress (address: string): void {
    this._routeManager.removeRoute(SELF_PEER_ID, address)
  }

  private _addRoute (peerId: string, prefix: string) {
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

  private _removeRoute (peerId: string, prefix: string) {
    this._routeManager.removeRoute(peerId, prefix)
  }
}
