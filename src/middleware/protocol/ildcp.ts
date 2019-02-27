import { IlpPrepare, IlpReply, deserializeIlpReply, serializeIlpPrepare, deserializeIlpPacket, deserializeIlpPrepare, serializeIlpReply } from 'ilp-packet'
import * as ILDCP from 'ilp-protocol-ildcp'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { PeerInfo } from '../../types/peer'
import { Endpoint } from '../../types/endpoint'

export interface IldcpMiddlewareServices {
  getPeerInfo: () => PeerInfo,
  getOwnAddress: () => string
}

export class IldcpMiddleware extends Middleware {
  constructor ({ getPeerInfo, getOwnAddress }: IldcpMiddlewareServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (request.destination === 'peer.config') {
          const { assetCode, assetScale, ilpAddressSegment, id, relation } = getPeerInfo()
          if (relation !== 'child') {
            throw new Error('Can\'t generate address for a peer that isn\t a child.')
          }
          const clientAddress = getOwnAddress() + '.' + (ilpAddressSegment || id)
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

  async getAddressFrom (parentEndpoint: Endpoint<IlpPrepare, IlpReply>): Promise<string> {
    const { clientAddress } = await ILDCP.fetch(async (data: Buffer): Promise<Buffer> => {
      const ildcpRequest = deserializeIlpPrepare(data)
      const reply = await parentEndpoint.sendOutgoingRequest(ildcpRequest)
      return serializeIlpReply(reply)
    })

    if (clientAddress === 'unknown') throw new Error('no ilp address configured')

    return clientAddress
  }
}
