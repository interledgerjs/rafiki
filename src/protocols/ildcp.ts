import { serve as ildcpServe } from 'ilp-protocol-ildcp'
import { Rule } from '../types/rule'
import { log } from '../winston'
import { SELF_PEER_ID } from '../constants'
const logger = log.child({ component: 'ildcp-protocol' })

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 */
export class IldcpProtocol extends Rule {
  constructor () {
    super({
      incoming: async ({ services, state: { ilp, peers : { incoming } } }, next) => {
        if (ilp.req.destination === 'peer.config') {

          const { info } = await incoming
          const { assetCode, assetScale, protocols: { ildcp }, id, relation } = info

          if (relation !== 'child') {
            logger.warn('received ILDCP request for peer that is not a child', { peerId: id, relation })
            throw new Error('Can\'t generate address for a peer that isn\t a child.')
          }

          // TODO: Ensure we get at least length > 0
          const serverAddress = services.connector.getAddresses(SELF_PEER_ID)[0]
          const clientAddress = services.connector.getAddresses(id)[0]

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
