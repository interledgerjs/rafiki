import { Router as RoutingTable, PeerController } from 'ilp-router'
import { Endpoint } from './types/endpoint'
import { IlpPrepare, IlpReply, IlpFulfill } from 'ilp-packet';
import { constructPipelines, constructMiddlewarePipeline } from '../src/lib/middleware';
import Middleware from './types/middleware';
import { PeerInfo } from './types/peer';
import CcpMiddleware, { CcpMiddlewareServices } from './middleware/protocol/ccp';
import { Ildcp as IldcpMiddleware, IldcpMiddlewareServices } from './middleware/protocol/ildcp';

const fulfillPacket: IlpFulfill = {
  fulfillment: Buffer.from('ILPHaxsILPHaxsILPHaxsILPHILPHaxs'),
  data: Buffer.alloc(0)
}

const ownAddress: string= 'test.connie'
export default class Connector {
  routingTable: RoutingTable = new RoutingTable()
  peerControllerMap: Map<string, PeerController> = new Map()

  addPeer(peerInfo: PeerInfo, endpoint: Endpoint<IlpPrepare, IlpReply>, businessMiddleware: { [key: string]: Middleware }) {
    const protocolMiddleware = {
      'ccp': new CcpMiddleware({ 
        handleCcpRouteControl: async (packet: IlpPrepare) => fulfillPacket, 
        handleCcpRouteUpdate: async (packet: IlpPrepare) => fulfillPacket 
      } as CcpMiddlewareServices),
      'ildcp': new IldcpMiddleware({
        getPeerInfo: () => peerInfo,
        getOwnAddress: () => ownAddress,
        getPeerAddress: () =>ownAddress + '.' + peerInfo.id
      } as IldcpMiddlewareServices)
    }
        
    const middleware = Object.assign(businessMiddleware, protocolMiddleware)
    const pipelines = constructPipelines(middleware)

  //   const opts = {
  //     peerId: id,
  // isSender?: boolean,
  // isReceiver?: boolean,
  // ccpRequestHandler?: (ccpRequest: any) => Promise<any>,
  // sendData: (packet: IlpPrepare) => Promise<IlpReply>,
  // getPeerRelation: (peerId: string) => Relation,
  // forwardingRoutingTable: ForwardingRoutingTable
  //   }
  //   const peerController = new PeerController()
  }

  getPeer(id: string): PeerController {
    const peerController = this.peerControllerMap.get(id)
    if (!peerController) throw new Error(`Cannot find peer with id=${id}`)

    return peerController
  }

}