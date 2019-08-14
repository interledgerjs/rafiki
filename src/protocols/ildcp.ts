import { serve as ildcpServe } from 'ilp-protocol-ildcp'
import { Rule } from '../types/rule'
import { log } from '../winston'
const logger = log.child({ component: 'ildcp-protocol' })

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 */
export class IldcpProtocol extends Rule {
  constructor () {
    super({
      incoming: async ({ services, state: { ilp, peers : { incoming : { info } } } }, next) => {
        if (ilp.req.destination === 'peer.config') {
          const { assetCode, assetScale, protocols: { ildcp }, id, relation } = info
          if (relation !== 'child') {
            logger.warn('received ILDCP request for peer that is not a child', { peerId: id, relation })
            throw new Error('Can\'t generate address for a peer that isn\t a child.')
          }
          const segment = (ildcp && ildcp.ilpAddressSegment) ? ildcp.ilpAddressSegment : id
          const serverAddress = services.connector.getOwnAddress()
          const clientAddress = serverAddress + '.' + segment
          logger.info('responding to ILDCP request from child', { peerId: id, address: clientAddress })

          // TODO: Remove unnecessary serialization from ILDCP module
          ilp.rawRes = await ildcpServe({
            requestPacket: ilp.rawReq,
            handler: () => Promise.resolve({
              clientAddress,
              assetScale,
              assetCode
            }),
            serverAddress
          })
        }
      }
    })
  }
}
