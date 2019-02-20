import { IlpPrepare, IlpReply, deserializeIlpReply, serializeIlpPrepare } from 'ilp-packet'
import * as ILDCP from 'ilp-protocol-ildcp'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { PeerInfo } from '../../types/peer'

export interface IldcpMiddlewareServices {
  getPeerInfo: () => PeerInfo,
  getOwnAddress: () => string,
  getPeerAddress: () => string
}

export class IldcpMiddleware extends Middleware {
  constructor ({ getPeerInfo, getOwnAddress, getPeerAddress }: IldcpMiddlewareServices) {
    super({
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        const { destination } = request

        if (destination === 'peer.config') {
          const { assetCode, assetScale } = getPeerInfo()
          const clientAddress = getPeerAddress()
          // TODO: Remove unnecessary serialization from ILDCP module
          return deserializeIlpReply(await ILDCP.serve({
            requestPacket: serializeIlpPrepare(request),
            handler: () => Promise.resolve({
              clientAddress,
              assetScale,
              assetCode
            }),
            serverAddress: getOwnAddress()
          }))
        }

        return next(request)

      }
    })
  }
}
