import { IlpPrepare, IlpReply, deserializeIlpReply, serializeIlpPrepare, deserializeIlpPacket, deserializeIlpPrepare, serializeIlpReply } from 'ilp-packet'
import * as ILDCP from 'ilp-protocol-ildcp'
import { Rule, IlpRequestHandler } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { Endpoint } from '../types/endpoint'

export interface IldcpProtocolServices {
  getPeerInfo: () => PeerInfo,
  getOwnAddress: () => string
}

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 */
export class IldcpProtocol extends Rule {
  constructor ({ getPeerInfo, getOwnAddress }: IldcpProtocolServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (request.destination === 'peer.config') {
          const { assetCode, assetScale, protocols, id, relation } = getPeerInfo()
          const ildcpProtocol = protocols.filter(protocol => protocol.name === 'ildcp')[0]
          if (relation !== 'child') {
            throw new Error('Can\'t generate address for a peer that isn\t a child.')
          }
          const clientAddress = getOwnAddress() + '.' + (ildcpProtocol.ilpAddressSegment || id)
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
