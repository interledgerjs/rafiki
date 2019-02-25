import { Middleware, IlpRequestHandler, MiddlewareRequestHandler } from '../../../types/middleware'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpFulfill } from 'ilp-packet'
import { deserializeCcpRouteUpdateRequest, serializeCcpResponse, deserializeCcpRouteControlRequest } from 'ilp-protocol-ccp'
import ForwardingRoutingTable from 'ilp-router/build/ilp-router/forwarding-routing-table'
import { Relation } from 'ilp-router/build/types/relation'
import { CcpSender } from './ccp-sender'
import { CcpReceiver } from './ccp-receiver'
import { IncomingRoute } from 'ilp-router/build/types/routing'

export interface CcpMiddlewareServices {
  isSender: boolean,
  isReceiver: boolean,
  peerId: string,
  forwardingRoutingTable: ForwardingRoutingTable,
  getPeerRelation: (peerId: string) => Relation,
  getOwnAddress: () => string,
  addRoute: (route: IncomingRoute) => void,
  removeRoute: (peerId: string, prefix: string) => void
}

export class CcpMiddleware extends Middleware {

  ccpSender: CcpSender
  ccpReceiver: CcpReceiver

  constructor ({ isSender, isReceiver, peerId, forwardingRoutingTable, getPeerRelation, getOwnAddress, addRoute, removeRoute }: CcpMiddlewareServices) {
    super({})

    if (isReceiver) {
      this.ccpReceiver = new CcpReceiver({ peerId: peerId, sendData: this.sendData.bind(this), addRoute: addRoute, removeRoute: removeRoute })
    }

    if (isSender) {
      this.ccpSender = new CcpSender({
        peerId: peerId,
        sendData: this.sendData.bind(this),
        forwardingRoutingTable: forwardingRoutingTable,
        getOwnAddress: getOwnAddress,
        getPeerRelation: getPeerRelation,
        routeExpiry: 0,
        routeBroadcastInterval: 2400
      })
    }
  }

  protected _processIncoming: MiddlewareRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    switch (request.destination) {
      case 'peer.route.control': {
        return this.handleCcpRouteControlMessage(request)
        break
      }
      case 'peer.route.update': {
        return this.handleCcpRouteUpdateMessage(request)
        break
      }
      default: {
        return next(request)
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
    this.ccpSender.handleRouteControl(deserializeCcpRouteControlRequest(serializeIlpPrepare(packet)))
    return deserializeIlpFulfill(serializeCcpResponse())
  }

  async handleCcpRouteUpdateMessage (packet: IlpPrepare): Promise<IlpReply> {
    this.ccpReceiver.handleRouteUpdate(deserializeCcpRouteUpdateRequest(serializeIlpPrepare(packet)))
    return deserializeIlpFulfill(serializeCcpResponse())
  }

  sendData (packet: IlpPrepare): Promise<IlpReply> {
    return this.outgoing.write(packet)
  }
}
