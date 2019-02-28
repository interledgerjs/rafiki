import {
  CcpRouteControlRequest,
  CcpRouteUpdateRequest,
  Mode,
  CcpRoute,
  ModeReverseMap,
  serializeCcpRouteUpdateRequest
} from 'ilp-protocol-ccp'
import { IlpPrepare, IlpReply, deserializeIlpPrepare } from 'ilp-packet'
import { BroadcastRoute, Relation, RouteUpdate, ForwardingRoutingTable } from 'ilp-routing'
import { randomBytes } from 'mz/crypto'

export interface CcpSenderOpts {
  peerId: string
  sendData: (packet: IlpPrepare) => Promise<IlpReply>,
  getOwnAddress: () => string
  routeExpiry: number
  routeBroadcastInterval: number
  forwardingRoutingTable: ForwardingRoutingTable
  getPeerRelation: (accountId: string) => Relation
}

const MINIMUM_UPDATE_INTERVAL = 150
const MAX_EPOCHS_PER_UPDATE = 50

export class CcpSender {
  private forwardingRoutingTable: ForwardingRoutingTable
  private getPeerRelation: (peerId: string) => Relation

  private getOwnAddress: () => string
  private mode: Mode = Mode.MODE_IDLE
  private peerId: string
  private sendData: (packet: IlpPrepare) => Promise<IlpReply>
  private routeExpiry: number
  private routeBroadcastInterval: number

  /**
   * Next epoch that the peer requested from us.
   */
  private lastKnownEpoch: number = 0
  private lastUpdate: number = 0
  private sendRouteUpdateTimer?: NodeJS.Timer

  constructor ({
    peerId,
    sendData,
    forwardingRoutingTable,
    getOwnAddress,
    getPeerRelation: getAccountRelation,
    routeExpiry,
    routeBroadcastInterval
  }: CcpSenderOpts) {
    this.forwardingRoutingTable = forwardingRoutingTable
    this.peerId = peerId
    this.sendData = sendData
    this.getOwnAddress = getOwnAddress
    this.getPeerRelation = getAccountRelation
    this.routeExpiry = routeExpiry
    this.routeBroadcastInterval = routeBroadcastInterval
  }

  stop () {
    if (this.sendRouteUpdateTimer) {
      clearTimeout(this.sendRouteUpdateTimer)
    }
  }

  getLastUpdate () {
    return this.lastUpdate
  }

  getStatus () {
    return {
      epoch: this.lastKnownEpoch,
      mode: ModeReverseMap[this.mode]
    }
  }

  handleRouteControl ({
    mode,
    lastKnownRoutingTableId,
    lastKnownEpoch,
    features
  }: CcpRouteControlRequest) {
    if (this.mode !== mode) {
      // this.log.trace('peer requested changing routing mode. oldMode=%s newMode=%s', ModeReverseMap[this.mode], ModeReverseMap[mode])
    }
    this.mode = mode

    if (lastKnownRoutingTableId !== this.forwardingRoutingTable.routingTableId) {
      // this.log.trace('peer has old routing table id, resetting lastKnownEpoch to zero. theirTableId=%s correctTableId=%s', lastKnownRoutingTableId, this.forwardingRoutingTable.routingTableId)
      this.lastKnownEpoch = 0
    } else {
      // this.log.trace('peer epoch set. epoch=%s currentEpoch=%s', this.accountId, lastKnownEpoch, this.forwardingRoutingTable.currentEpoch)
      this.lastKnownEpoch = lastKnownEpoch
    }

    // We don't support any optional features, so we ignore the `features`

    if (this.mode === Mode.MODE_SYNC) {
      // Start broadcasting routes to this peer
      this.scheduleRouteUpdate()
    } else {
      // Stop broadcasting routes to this peer
      if (this.sendRouteUpdateTimer) {
        clearTimeout(this.sendRouteUpdateTimer)
        this.sendRouteUpdateTimer = undefined
      }
    }
  }

  scheduleRouteUpdate = () => {
    if (this.sendRouteUpdateTimer) {
      clearTimeout(this.sendRouteUpdateTimer)
      this.sendRouteUpdateTimer = undefined
    }

    if (this.mode !== Mode.MODE_SYNC) {
      return
    }

    const lastUpdate = this.lastUpdate
    const nextEpoch = this.lastKnownEpoch

    let delay: number
    if (nextEpoch < this.forwardingRoutingTable.currentEpoch) {
      delay = 0
    } else {
      delay = this.routeBroadcastInterval - (Date.now() - lastUpdate)
    }

    delay = Math.max(MINIMUM_UPDATE_INTERVAL, delay)

    // this.log.trace('scheduling next route update. accountId=%s delay=%s currentEpoch=%s peerHasEpoch=%s', this.peerId, delay, this.forwardingRoutingTable.currentEpoch, this.lastKnownEpoch)
    this.sendRouteUpdateTimer = setTimeout(() => {
      this.sendSingleRouteUpdate()
        .then(() => this.scheduleRouteUpdate())
        .catch((err: any) => {
          const errInfo = (err instanceof Object && err.stack) ? err.stack : err
          // this.log.debug('failed to broadcast route information to peer. peer=%s error=%s', this.peerId, errInfo)
        })
    }, delay)
    this.sendRouteUpdateTimer.unref()
  }

  private async sendSingleRouteUpdate () {
    this.lastUpdate = Date.now()

    const nextRequestedEpoch = this.lastKnownEpoch
    const allUpdates = this.forwardingRoutingTable.log
      .slice(nextRequestedEpoch, nextRequestedEpoch + MAX_EPOCHS_PER_UPDATE)

    const toEpoch = nextRequestedEpoch + allUpdates.length

    const relation = this.getPeerRelation(this.peerId)
    function isRouteUpdate (update: RouteUpdate | null): update is RouteUpdate {
      return !!update
    }

    const updates = allUpdates
      .filter(isRouteUpdate)
      .map((update: RouteUpdate) => {
        if (!update.route) return update

        if (
          // Don't send peer their own routes
          update.route.nextHop === this.peerId ||

          // Don't advertise peer and provider routes to providers
          (
            relation === 'parent' &&
            ['peer', 'parent'].indexOf(this.getPeerRelation(update.route.nextHop)) !== -1
          )
        ) {
          return {
            ...update,
            route: undefined
          }
        } else {
          return update
        }
      })

    const newRoutes: BroadcastRoute[] = []
    const withdrawnRoutes: { prefix: string, epoch: number }[] = []

    for (const update of updates) {
      if (update.route) {
        newRoutes.push({
          prefix: update.prefix,
          nextHop: update.route.nextHop,
          path: update.route.path
        })
      } else {
        withdrawnRoutes.push({
          prefix: update.prefix,
          epoch: update.epoch
        })
      }
    }

    // this.log.trace('broadcasting routes to peer. speaker=%s peer=%s fromEpoch=%s toEpoch=%s routeCount=%s unreachableCount=%s', this.getOwnAddress(), this.accountId, this.lastKnownEpoch, toEpoch, newRoutes.length, withdrawnRoutes.length)
    const auth = await randomBytes(32) // TODO temp for now
    const routeUpdate: CcpRouteUpdateRequest = {
      speaker: this.getOwnAddress(),
      routingTableId: this.forwardingRoutingTable.routingTableId,
      holdDownTime: this.routeExpiry,
      currentEpochIndex: this.forwardingRoutingTable.currentEpoch,
      fromEpochIndex: this.lastKnownEpoch,
      toEpochIndex: toEpoch,
      newRoutes: newRoutes.map(r => ({
        ...r,
        nextHop: undefined,
        auth: auth,
        props: []
      })),
      withdrawnRoutes: withdrawnRoutes.map(r => r.prefix)
    }

    // We anticipate that they're going to be happy with our route update and
    // request the next one.
    const previousNextRequestedEpoch = this.lastKnownEpoch
    this.lastKnownEpoch = toEpoch

    const timeout = this.routeBroadcastInterval

    const timerPromise: Promise<Buffer> = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('route update timed out.')), timeout)
      // Don't let this timer keep Node running
      timer.unref()
    })

    try {
      await Promise.race([
        this.sendData(deserializeIlpPrepare(serializeCcpRouteUpdateRequest(routeUpdate))),
        timerPromise
      ])
    } catch (err) {
      this.lastKnownEpoch = previousNextRequestedEpoch
      throw err
    }
  }
}
