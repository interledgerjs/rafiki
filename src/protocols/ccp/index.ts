import { Rule } from '../../types'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpFulfill } from 'ilp-packet'
import { deserializeCcpRouteUpdateRequest, serializeCcpResponse, deserializeCcpRouteControlRequest } from 'ilp-protocol-ccp'
import { ForwardingRoutingTable, IncomingRoute, Relation } from 'ilp-routing'
import { CcpSender } from './ccp-sender'
import { CcpReceiver } from './ccp-receiver'
import { log } from '../../winston'
import { TemporaryApplicationError } from 'ilp-packet/dist/src/errors'
import { IlpMiddleWare } from '../../koa/ilp-packet-middleware';
const logger = log.child({ component: 'ccp-protocol' })
export interface CcpMiddlewareServices {
  isSender: boolean,
  isReceiver: boolean,
  peerId: string,
  forwardingRoutingTable: ForwardingRoutingTable,
  getPeerRelation: (peerId: string) => Relation,
  getRouteWeight: (peerId: string) => number,
  getOwnAddress: () => string,
  addRoute: (route: IncomingRoute) => void,
  removeRoute: (peerId: string, prefix: string) => void
}

export class CcpProtocol extends Rule {

  ccpSender: CcpSender
  ccpReceiver: CcpReceiver

  constructor ({ isSender, isReceiver, peerId, forwardingRoutingTable, getPeerRelation, getOwnAddress, addRoute, removeRoute, getRouteWeight }: CcpMiddlewareServices) {
    super({})

    if (isReceiver) {
      logger.verbose('creating CCP Receiver for peer', { peerId })
      this.ccpReceiver = new CcpReceiver({ peerId: peerId, sendData: this.sendData.bind(this), addRoute: addRoute, removeRoute: removeRoute, getRouteWeight: getRouteWeight })
    }

    if (isSender) {
      logger.verbose('creating CCP Sending for peer', { peerId })
      this.ccpSender = new CcpSender({
        peerId: peerId,
        sendData: this.sendData.bind(this),
        forwardingRoutingTable: forwardingRoutingTable,
        getOwnAddress: getOwnAddress,
        getPeerRelation: getPeerRelation,
        routeExpiry: 0,
        routeBroadcastInterval: 10000
      })
    }
  }

  protected _processIncoming: IlpMiddleWare = async ({ state: { ilp } }, next) => {
    switch (ilp.req.destination) {
      case 'peer.route.control': {
        logger.silly('received peer.route.control', { request: ilp.req })
        ilp.res = await this.handleCcpRouteControlMessage(ilp.req)
        break
      }
      case 'peer.route.update': {
        logger.silly('received peer.route.update', { request: ilp.req })
        ilp.res = await this.handleCcpRouteUpdateMessage(ilp.req)
        break
      }
      default: {
        await next()
      }
    }
  }

  protected _startup = async () => {
    if (this.ccpReceiver) {
      this.ccpReceiver.sendRouteControl()
    }
  }

  protected _shutdown = async () => {
    if (this.ccpSender) {
      this.ccpSender.stop()
    }
  }

  async handleCcpRouteControlMessage (packet: IlpPrepare): Promise<IlpReply> {
    try {
      await this.ccpSender.handleRouteControl(deserializeCcpRouteControlRequest(serializeIlpPrepare(packet)))
      return deserializeIlpFulfill(serializeCcpResponse())
    } catch (error) {
      throw new TemporaryApplicationError('Unable to handle CCP Route Control', Buffer.from(''))
    }
  }

  async handleCcpRouteUpdateMessage (packet: IlpPrepare): Promise<IlpReply> {
    try {
      await this.ccpReceiver.handleRouteUpdate(deserializeCcpRouteUpdateRequest(serializeIlpPrepare(packet)))
      return deserializeIlpFulfill(serializeCcpResponse())
    } catch (error) {
      throw new TemporaryApplicationError('Unable to handle CCP Route Update', Buffer.from(''))
    }
  }

  sendData (packet: IlpPrepare): Promise<IlpReply> {
    return this.outgoing.write(packet)
  }
}
