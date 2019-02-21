import { Type, IlpPrepare, IlpReply, deserializeIlpPrepare } from 'ilp-packet'
import {
  CcpRouteControlRequest,
  CcpRouteUpdateRequest,
  Mode,
  serializeCcpRouteControlRequest
} from 'ilp-protocol-ccp'
import PrefixMap from 'ilp-router/build/lib/prefix-map'
import { IncomingRoute } from 'ilp-router/build/types/routing'

export interface CcpReceiverOpts {
  peerId: string,
  sendData: (packet: IlpPrepare) => Promise<IlpReply>
}

const ROUTE_CONTROL_RETRY_INTERVAL = 30000

// TODO: Pass the local routing table up to the peer
export class CcpReceiver {

  private peerId: string
  private sendData: (packet: IlpPrepare) => Promise<IlpReply>

  private routes: PrefixMap<IncomingRoute>
  private expiry: number = 0

  /**
   * Current routing table id used by our peer.
   *
   * We'll reset our epoch if this changes.
   */
  private routingTableId: string = '00000000-0000-0000-0000-000000000000'
  /**
   * Epoch index up to which our peer has sent updates
   */
  private epoch: number = 0

  constructor ({ peerId, sendData }: CcpReceiverOpts) {
    this.routes = new PrefixMap()
    this.peerId = peerId
    this.sendData = sendData
  }

  bump (holdDownTime: number) {
    this.expiry = Math.max(Date.now() + holdDownTime, this.expiry)
  }

  getPrefixes () {
    return this.routes.keys()
  }

  getRoutingTableId () {
    return this.routingTableId
  }

  getEpoch () {
    return this.epoch
  }

  getStatus () {
    return {
      routingTableId: this.routingTableId,
      epoch: this.epoch
    }
  }

  handleRouteUpdate ({
    speaker,
    routingTableId,
    fromEpochIndex,
    toEpochIndex,
    holdDownTime,
    newRoutes,
    withdrawnRoutes
  }: CcpRouteUpdateRequest): string[] {
    this.bump(holdDownTime)

    if (this.routingTableId !== routingTableId) {
      // this.log.trace('saw new routing table. oldId=%s newId=%s', this.routingTableId, routingTableId)
      this.routingTableId = routingTableId
      this.epoch = 0
    }

    if (fromEpochIndex > this.epoch) {
      // There is a gap, we need to go back to the last epoch we have
      // this.log.trace('gap in routing updates. expectedEpoch=%s actualFromEpoch=%s', this.epoch, fromEpochIndex)
      return []
    }
    if (this.epoch > toEpochIndex) {
      // This routing update is older than what we already have
      // this.log.trace('old routing update, ignoring. expectedEpoch=%s actualToEpoch=%s', this.epoch, toEpochIndex)
      return []
    }

    // just a heartbeat
    if (newRoutes.length === 0 && withdrawnRoutes.length === 0) {
      // this.log.trace('pure heartbeat. fromEpoch=%s toEpoch=%s', fromEpochIndex, toEpochIndex)
      this.epoch = toEpochIndex
      return []
    }

    const changedPrefixes: string[] = []
    if (withdrawnRoutes.length > 0) {
      // this.log.trace('informed of no longer reachable routes. count=%s routes=%s', withdrawnRoutes.length, withdrawnRoutes)
      for (const prefix of withdrawnRoutes) {
        if (this.deleteRoute(prefix)) {
          changedPrefixes.push(prefix)
        }
      }
    }

    // TODO: removed peerId and auth from incoming routes
    for (const route of newRoutes) {
      if (this.addRoute({
        prefix: route.prefix,
        path: route.path
      })) {
        changedPrefixes.push(route.prefix)
      }
    }

    this.epoch = toEpochIndex

    // this.log.trace('applied route update. changedPrefixesCount=%s fromEpoch=%s toEpoch=%s', changedPrefixes.length, fromEpochIndex, toEpochIndex)

    return changedPrefixes
  }

  getPrefix (prefix: string) {
    return this.routes.get(prefix)
  }

  sendRouteControl = () => {
    const routeControl: CcpRouteControlRequest = {
      mode: Mode.MODE_SYNC,
      lastKnownRoutingTableId: this.routingTableId,
      lastKnownEpoch: this.epoch,
      features: []
    }

    this.sendData(deserializeIlpPrepare(serializeCcpRouteControlRequest(routeControl)))
      .then(data => {
        if (data[0] === Type.TYPE_ILP_FULFILL) {
          // this.log.trace('successfully sent route control message.')
        } else if (data[0] === Type.TYPE_ILP_REJECT) {
          // this.log.debug('route control message was rejected. rejection=%j', deserializeIlpReject(data))
          throw new Error('route control message rejected.')
        } else {
          // this.log.debug('unknown response packet type. type=' + data[0])
          throw new Error('route control message returned unknown response.')
        }
      })
      .catch((err: any) => {
        const errInfo = (err instanceof Object && err.stack) ? err.stack : err
        // this.log.debug('failed to set route control information on peer. error=%s', errInfo)
        // TODO: Should have more elegant, thought-through retry logic here
        const retryTimeout = setTimeout(this.sendRouteControl, ROUTE_CONTROL_RETRY_INTERVAL)

        retryTimeout.unref()
      })
  }

  private addRoute (route: IncomingRoute) {
    this.routes.insert(route.prefix, route)

    // TODO Check if actually changed
    return true
  }

  private deleteRoute (prefix: string) {
    this.routes.delete(prefix)

    // TODO Check if actually changed
    return true
  }
}
