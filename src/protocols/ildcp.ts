import { serve as ildcpServe } from 'ilp-protocol-ildcp'
import { Rule } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { log } from '../winston'
import { AppServices } from '../services';
const logger = log.child({ component: 'ildcp-protocol' })
export interface IldcpProtocolServices {
  getOwnAddress: () => string
}

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 */
export class IldcpProtocol extends Rule {
  constructor (services: AppServices, { getOwnAddress }: IldcpProtocolServices) {
    super(services, {
      incoming: async ({ state: { ilp, peers } }, next) => {
        if (ilp.req.destination === 'peer.config') {
          const { assetCode, assetScale, protocols: { ildcp }, id, relation } = peers.incoming
          if (relation !== 'child') {
            logger.warn('received ILDCP request for peer that is not a child', { peerId: id, relation })
            throw new Error('Can\'t generate address for a peer that isn\t a child.')
          }
          const segment = (ildcp && ildcp.ilpAddressSegment) ? ildcp.ilpAddressSegment : id
          const clientAddress = getOwnAddress() + '.' + segment
          logger.info('responding to ILDCP request from child', { peerId: id, address: clientAddress })

          // TODO: Remove unnecessary serialization from ILDCP module
          ilp.rawRes = await ildcpServe({
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
