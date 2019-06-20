import { Type, IlpPrepare, IlpReply, deserializeIlpPrepare, isFulfill, isReject } from 'ilp-packet'
import {
  CcpRouteControlRequest,
  CcpRouteUpdateRequest,
  Mode,
  serializeCcpRouteControlRequest
} from 'ilp-protocol-ccp'
import { IncomingRoute } from 'ilp-routing'
import { log } from './../../winston'
const logger = log.child({ component: 'ccp-receiver' })
export interface CcpReceiverOpts {
  peerId: string,
  sendData: (packet: IlpPrepare) => Promise<IlpReply>,
  addRoute: (route: IncomingRoute) => void,
  removeRoute: (peerId: string, prefix: string) => void,
  getRouteWeight: (peerId: string) => number
}

const ROUTE_CONTROL_RETRY_INTERVAL = 30000

// TODO: Pass the local routing table up to the peer
export class CcpReceiver {

  private peerId: string
  private sendData: (packet: IlpPrepare) => Promise<IlpReply>
  private addRoute: (route: IncomingRoute) => void
  private removeRoute: (peerId: string, prefix: string) => void
  private getRouteWeight: (peerId: string) => number

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

  constructor ({ peerId, sendData, addRoute, removeRoute, getRouteWeight }: CcpReceiverOpts) {
    this.peerId = peerId
    this.sendData = sendData
    this.addRoute = addRoute
    this.removeRoute = removeRoute
    this.getRouteWeight = getRouteWeight
    setInterval(this.shouldSendRouteControl.bind(this), 20 * 1000)
  }

  bump (holdDownTime: number) {
    this.expiry = Date.now()
  }

  shouldSendRouteControl () {
    logger.silly('Checking if need to send new route control')
    if (Date.now() - this.expiry > 60 * 1000) {
      this.sendRouteControl(true)
    }
  }

  getStatus () {
    return {
      routingTableId: this.routingTableId,
      epoch: this.epoch
    }
  }

  async handleRouteUpdate ({
    speaker,
    routingTableId,
    fromEpochIndex,
    toEpochIndex,
    holdDownTime,
    newRoutes,
    withdrawnRoutes
  }: CcpRouteUpdateRequest) {
    this.bump(holdDownTime)

    if (this.routingTableId !== routingTableId) {
      logger.silly('saw new routing table.', { oldRoutingTableId: this.routingTableId, newRoutingTableId: routingTableId })
      this.routingTableId = routingTableId
      this.epoch = 0
    }

    if (fromEpochIndex > this.epoch) {
      // There is a gap, we need to go back to the last epoch we have
      logger.silly('gap in routing updates', { expectedEpoch: this.epoch, actualFromEpoch: fromEpochIndex })
      this.sendRouteControl(true) // TODO: test
      return []
    }
    if (this.epoch > toEpochIndex) {
      // This routing update is older than what we already have
      logger.silly('old routing update, ignoring', { expectedEpoch: this.epoch, actualFromEpoch: toEpochIndex })
      return []
    }

    // just a heartbeat
    if (newRoutes.length === 0 && withdrawnRoutes.length === 0) {
      logger.silly('pure heartbeat.', { fromEpoch: fromEpochIndex , toEpoch: toEpochIndex })
      this.epoch = toEpochIndex
      return []
    }

    const changedPrefixes: string[] = []
    if (withdrawnRoutes.length > 0) {
      logger.silly('received withdrawn routes', { routes: withdrawnRoutes })
      for (const prefix of withdrawnRoutes) {
        this.removeRoute(this.peerId, prefix)
      }
    }

    for (const route of newRoutes) {
      this.addRoute({
        peer: this.peerId,
        prefix: route.prefix,
        path: route.path,
        weight: this.getRouteWeight(this.peerId)
      })
    }

    this.epoch = toEpochIndex

    logger.verbose('applied route update', { count: changedPrefixes.length, fromEpoch: fromEpochIndex, toEpoch: toEpochIndex })
  }

  sendRouteControl = (sendOnce: boolean = false) => {
    const routeControl: CcpRouteControlRequest = {
      mode: Mode.MODE_SYNC,
      lastKnownRoutingTableId: this.routingTableId,
      lastKnownEpoch: this.epoch,
      features: []
    }
    logger.silly('Sending Route Control message')

    this.sendData(deserializeIlpPrepare(serializeCcpRouteControlRequest(routeControl)))
      .then(packet => {
        if (isFulfill(packet)) {
          logger.silly('successfully sent route control message.')
        } else if (isReject(packet)) {
          logger.debug('route control message was rejected.')
          throw new Error('route control message rejected.')
        } else {
          logger.debug('unknown response packet type')
          throw new Error('route control message returned unknown response.')
        }
      })
      .catch((err: any) => {
        const errInfo = (err instanceof Object && err.stack) ? err.stack : err
        logger.debug('failed to set route control information on peer', { error: errInfo })
        // TODO: Should have more elegant, thought-through retry logic here
        if (!sendOnce) {
          const retryTimeout = setTimeout(this.sendRouteControl, ROUTE_CONTROL_RETRY_INTERVAL)
          retryTimeout.unref()
        }

      })
  }
}
