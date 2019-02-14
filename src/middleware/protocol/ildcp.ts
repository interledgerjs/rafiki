import { IlpPrepare, IlpReply, deserializeIlpReply, serializeIlpPrepare } from 'ilp-packet'
import * as ILDCP from 'ilp-protocol-ildcp'
import Middleware, { MiddlewareCallback, Pipelines, MiddlewareServices } from '../../types/middleware'
import { PeerInfo } from '../../types/peer';

export interface IldcpMiddlewareServices extends MiddlewareServices {
  getPeerInfo: () => PeerInfo,
  getOwnAddress: () => string,
  getPeerAddress: () => string
}

export class Ildcp implements Middleware {

  getPeerInfo: () => PeerInfo
  getOwnAddress: () => string
  getPeerAddress: () => string

  constructor ({ getPeerInfo, getOwnAddress, getPeerAddress }: IldcpMiddlewareServices) {
    this.getPeerInfo = getPeerInfo
    this.getOwnAddress = getOwnAddress
    this.getPeerAddress = getPeerAddress
  }

  async applyToPipelines (pipelines: Pipelines) {
      pipelines.incomingData.insertLast({
      name: 'ildcp',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        const { destination } = packet

        if(destination === 'peer.config'){
          const peerInfo = this.getPeerInfo()
          const peerAddress = this.getPeerAddress()
          
          return deserializeIlpReply(await ILDCP.serve({
            requestPacket: serializeIlpPrepare(packet),
            handler: () => Promise.resolve({
              clientAddress: peerAddress,
              assetScale: peerInfo.assetScale,
              assetCode: peerInfo.assetCode,
            }),
            serverAddress: this.getOwnAddress()
          }))

        }

        return next(packet)
      }
    })
  }
}