import { isFulfill, isReject, deserializeIlpReply } from 'ilp-packet'
import {
  CcpRouteControlRequest,
  CcpRouteUpdateRequest,
  Mode,
  serializeCcpRouteControlRequest,
  CcpRouteUpdateResponse
} from 'ilp-protocol-ccp'
import { IncomingRoute } from 'ilp-routing'
import { PeerNotFoundError } from '../../errors'
import { Logger } from '../../types'

export class CcpReceiverService extends Map<string,CcpReceiver> {
  public getOrThrow (id: string): CcpReceiver {
    const receiver = this.get(id)
    if (!receiver) throw new PeerNotFoundError(id)
    return receiver
  }
}

export interface CcpReceiverOpts {
  peerId: string,
  sendData: (packet: Buffer) => Promise<Buffer>,
  addRoute: (route: IncomingRoute) => void,
  removeRoute: (peerId: string, prefix: string) => void,
  getRouteWeight: (peerId: string) => number
}

const ROUTE_CONTROL_RETRY_INTERVAL = 30000

// TODO: Pass the local routing table up to the peer
export class CcpReceiver {

  private _peerId: string
  private _sendData: (packet: Buffer) => Promise<Buffer>
  private _addRoute: (route: IncomingRoute) => void
  private _removeRoute: (peerId: string, prefix: string) => void
  private _getRouteWeight: (peerId: string) => number
  private _expiry: number = 0

  /**
   * Current routing table id used by our peer.
   *
   * We'll reset our epoch if this changes.
   */
  private _routingTableId: string = '00000000-0000-0000-0000-000000000000'

  /**
   * Epoch index up to which our peer has sent updates
   */
  private _epoch: number = 0

  constructor ({ peerId, sendData, addRoute, removeRoute, getRouteWeight }: CcpReceiverOpts, private _log: Logger) {
    this._peerId = peerId
    this._sendData = sendData
    this._addRoute = addRoute
    this._removeRoute = removeRoute
    this._getRouteWeight = getRouteWeight
    const interval = setInterval(async () => {
      await this._maybeSendRouteControl()
    }, 20 * 1000)
    interval.unref()
  }

  public getStatus () {
    return {
      routingTableId: this._routingTableId,
      epoch: this._epoch
    }
  }

  public async handleRouteUpdate ({
    speaker,
    routingTableId,
    fromEpochIndex,
    toEpochIndex,
    holdDownTime,
    newRoutes,
    withdrawnRoutes
  }: CcpRouteUpdateRequest): Promise<CcpRouteUpdateResponse> {
    this._bump(holdDownTime)

    if (this._routingTableId !== routingTableId) {
      this._log.trace('saw new routing table.', { oldRoutingTableId: this._routingTableId, newRoutingTableId: routingTableId })
      this._routingTableId = routingTableId
      this._epoch = 0
    }

    if (fromEpochIndex > this._epoch) {
      // There is a gap, we need to go back to the last epoch we have
      this._log.trace('gap in routing updates', { expectedEpoch: this._epoch, actualFromEpoch: fromEpochIndex })
      await this.sendRouteControl(true) // TODO: test
      return []
    }
    if (this._epoch > toEpochIndex) {
      // This routing update is older than what we already have
      this._log.trace('old routing update, ignoring', { expectedEpoch: this._epoch, actualFromEpoch: toEpochIndex })
      return []
    }

    // just a heartbeat
    if (newRoutes.length === 0 && withdrawnRoutes.length === 0) {
      this._log.trace('pure heartbeat.', { fromEpoch: fromEpochIndex , toEpoch: toEpochIndex })
      this._epoch = toEpochIndex
      return []
    }

    const changedPrefixes: string[] = []
    if (withdrawnRoutes.length > 0) {
      this._log.trace('received withdrawn routes', { routes: withdrawnRoutes })
      for (const prefix of withdrawnRoutes) {
        this._removeRoute(this._peerId, prefix)
      }
    }

    for (const route of newRoutes) {
      this._addRoute({
        peer: this._peerId,
        prefix: route.prefix,
        path: route.path,
        weight: this._getRouteWeight(this._peerId)
      })
    }

    this._epoch = toEpochIndex

    this._log.debug('applied route update', { count: changedPrefixes.length, fromEpoch: fromEpochIndex, toEpoch: toEpochIndex })

    return {} as CcpRouteUpdateResponse
  }

  public async sendRouteControl (sendOnce: boolean = false): Promise<void> {
    const routeControl: CcpRouteControlRequest = {
      mode: Mode.MODE_SYNC,
      lastKnownRoutingTableId: this._routingTableId,
      lastKnownEpoch: this._epoch,
      features: []
    }
    this._log.trace('Sending Route Control message')

    try {
      const data = await this._sendData(serializeCcpRouteControlRequest(routeControl))
      const packet = deserializeIlpReply(data)
      if (isFulfill(packet)) {
        this._log.trace('successfully sent route control message.')
      } else if (isReject(packet)) {
        this._log.debug('route control message was rejected.')
        throw new Error('route control message rejected.')
      } else {
        this._log.debug('unknown response packet type')
        throw new Error('route control message returned unknown response.')
      }
    } catch (err) {
      const errInfo = (err instanceof Object && err.stack) ? err.stack : err
      this._log.debug('failed to set route control information on peer', { error: errInfo })
      // TODO: Should have more elegant, thought-through retry logic here
      if (!sendOnce) {
        const retryTimeout = setTimeout(this.sendRouteControl, ROUTE_CONTROL_RETRY_INTERVAL)
        retryTimeout.unref()
      }
    }
  }
  private _bump (holdDownTime: number) {
    // TODO: Should this be now() + holdDownTime?
    this._expiry = Date.now()
  }

  private async _maybeSendRouteControl () {
    this._log.debug('Checking if need to send new route control')
    if (Date.now() - this._expiry > 60 * 1000) {
      await this.sendRouteControl(true)
    }
  }

}
