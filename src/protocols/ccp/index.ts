import { Rule, PeerInfo } from '../../types'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpFulfill } from 'ilp-packet'
import { deserializeCcpRouteUpdateRequest, serializeCcpResponse, deserializeCcpRouteControlRequest } from 'ilp-protocol-ccp'
import { ForwardingRoutingTable, IncomingRoute, Relation } from 'ilp-routing'
import { CcpSender, CcpSenderService } from './ccp-sender'
import { CcpReceiver, CcpReceiverService } from './ccp-receiver'
import { log } from '../../winston'
import { TemporaryApplicationError } from 'ilp-packet/dist/src/errors'
import { IlpMiddleWare } from '../../koa/ilp-packet-middleware';
import { AppServices } from '../../services';
const logger = log.child({ component: 'ccp-protocol' })
export interface CcpMiddlewareServices {
  forwardingRoutingTable: ForwardingRoutingTable,
  getPeerRelation: (peerId: string) => Relation,
  getRouteWeight: (peerId: string) => number,
  getOwnAddress: () => string,
  addRoute: (route: IncomingRoute) => void,
  removeRoute: (peerId: string, prefix: string) => void
}

export class CcpProtocol extends Rule {

  private _ccpSenders: CcpSenderService
  private _ccpReceivers: CcpReceiverService
  private _addRoute: (route: IncomingRoute) => void
  private _removeRoute: (peerId: string, prefix: string) => void
  private _getOwnAddress: () => string
  private _forwardingRoutingTable: ForwardingRoutingTable
  private _getPeerRelation: (peerId: string) => Relation
  private _getRouteWeight: (peerId: string) => number
  constructor (services: AppServices, { forwardingRoutingTable, getPeerRelation, getOwnAddress, addRoute, removeRoute, getRouteWeight }: CcpMiddlewareServices) {
    super(services, {
      incoming: async ({ state: { ilp, peers } }, next) => {
        switch (ilp.req.destination) {
          case 'peer.route.control': {
            logger.silly('received peer.route.control', { request: ilp.req })
            try {
              await this._ccpSenders.getOrThrow(peers.incoming.id)
                .handleRouteControl(deserializeCcpRouteControlRequest(ilp.rawReq))
              ilp.rawRes = serializeCcpResponse()
            } catch (error) {
              throw new TemporaryApplicationError('Unable to handle CCP Route Control', Buffer.from(''))
            }
            break
          }
          case 'peer.route.update': {
            logger.silly('received peer.route.update', { request: ilp.req })
            try {
              await this._ccpReceivers.getOrThrow(peers.incoming.id)
                .handleRouteUpdate(deserializeCcpRouteUpdateRequest(ilp.rawReq))
              ilp.rawRes = serializeCcpResponse()
            } catch (error) {
              throw new TemporaryApplicationError('Unable to handle CCP Route Update', Buffer.from(''))
            }
            break
          }
          default: {
            await next()
          }
        }
      },
      // TODO: We are starting the sender once it's created, do we need this?
      // startup: async () => {
      //   if (this._ccpReceivers.size > 0) {
      //     await this._ccpReceivers.sendRouteControlFromAll()
      //   }
      // },
      shutdown: async () => {
        if (this._ccpSenders.size > 0) {
          this._ccpSenders.stopAll()
        }
      }
    })

    this._addRoute = addRoute
    this._removeRoute = removeRoute
    this._getOwnAddress = getOwnAddress
    this._forwardingRoutingTable = forwardingRoutingTable
    this._getPeerRelation = getPeerRelation
    this._getRouteWeight = getRouteWeight
  }

  public async addPeer (peer: PeerInfo) {
    const { id, protocols: { ccp } } = peer
    if (ccp.isReceiver) {
      logger.verbose('creating CCP Receiver for peer', { peerId: id })
      const receiver = new CcpReceiver({
        peerId: peer.id,
        sendData: async (data: Buffer) => {
          return this._services.clients.getOrThrow(id).send(data)
        },
        addRoute: this._addRoute,
        removeRoute: this._removeRoute,
        getRouteWeight: this._getRouteWeight
      })
      this._ccpReceivers.set(peer.id, receiver)
      await receiver.sendRouteControl()
    }
    if (ccp.isSender) {
      logger.verbose('creating CCP Sending for peer', { peerId: id })
      const sender = new CcpSender({
        peerId: id,
        sendData: async (data: Buffer) => {
          return this._services.clients.getOrThrow(id).send(data)
        },
        forwardingRoutingTable: this._forwardingRoutingTable,
        getOwnAddress: this._getOwnAddress,
        getPeerRelation: this._getPeerRelation,
        routeExpiry: 0,
        routeBroadcastInterval: 10000
      })
      this._ccpSenders.set(id, sender)
    }
  }

  public async removePeer (id: string) {
    this._ccpReceivers.delete(id)
    const sender = this._ccpSenders.get(id)
    if (sender) {
      sender.stop()
      this._ccpSenders.delete(id)
    }
  }
}
