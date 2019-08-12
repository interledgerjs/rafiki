import { IlpPrepare, IlpReply, deserializeIlpReply, serializeIlpPrepare, deserializeIlpPacket, deserializeIlpPrepare, serializeIlpReply } from 'ilp-packet'
import * as ILDCP from 'ilp-protocol-ildcp'
import { Rule } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { Endpoint } from '../types/endpoint'
import { log } from '../winston'
const logger = log.child({ component: 'ildcp-protocol' })
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
      incoming: async ({ state: { ilp } }, next) => {
        if (ilp.req.destination === 'peer.config') {
          const { assetCode, assetScale, protocols, id, relation } = getPeerInfo()
          const ildcpProtocol = protocols.filter(protocol => protocol.name === 'ildcp')[0]
          if (relation !== 'child') {
            logger.warn('received ILDCP request for peer that is not a child', { peerId: id, relation })
            throw new Error('Can\'t generate address for a peer that isn\t a child.')
          }
          const clientAddress = getOwnAddress() + '.' + (ildcpProtocol.ilpAddressSegment || id)
          logger.info('responding to ILDCP request from child', { address: clientAddress })

          // TODO: Remove unnecessary serialization from ILDCP module
          ilp.rawRes = await ILDCP.serve({
            requestPacket: ilp.rawReq,
            handler: () => Promise.resolve({
              clientAddress,
              assetScale,
              assetCode
            }),
            serverAddress: getOwnAddress()
          })
        }
      }
    })
  }
}

export async function getAddressFrom (parentEndpoint: Endpoint<IlpPrepare, IlpReply>): Promise<string> {
  const { clientAddress } = await ILDCP.fetch(async (data: Buffer): Promise<Buffer> => {
    const ildcpRequest = deserializeIlpPrepare(data)
    logger.info('sending ILDCP address to parent')
    const reply = await parentEndpoint.sendOutgoingRequest(ildcpRequest)
    return serializeIlpReply(reply)
  })

  if (clientAddress === 'unknown') {
    logger.error('Failed to get ILDCP address from parent.')
    throw new Error('Failed to get ILDCP address from parent.')
  }

  logger.info('received ILDCP address from parent', { address: clientAddress })
  return clientAddress
}
