import { serve as ildcpServe } from 'ilp-protocol-ildcp'
import { log } from '../logger'
import { SELF_PEER_ID } from '../constants'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'ildcp-protocol' })

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 *
 * TODO: Should be a controller
 */
export function createIncomingIldcpProtocolMiddleware () {
  return async ({ services, ilp, state: { peers : { incoming } } }: RafikiContext, next: () => Promise<any>) => {
    if (ilp.prepare.destination === 'peer.config') {

      const { info } = await incoming
      const { assetCode, assetScale, protocols: { ildcp }, id, relation } = info

      if (relation !== 'child') {
        logger.warn('received ILDCP request for peer that is not a child', { peerId: id, relation })
        throw new Error('Can\'t generate address for a peer that isn\t a child.')
      }

      // TODO: Ensure we get at least length > 0
      const serverAddress = services.router.getAddresses(SELF_PEER_ID)[0]
      const clientAddress = services.router.getAddresses(id)[0]

      logger.info('responding to ILDCP request from child', { peerId: id, address: clientAddress })

      // TODO: Remove unnecessary serialization from ILDCP module
      ilp.respond(await ildcpServe({
        requestPacket: ilp.prepare.raw,
        handler: () => Promise.resolve({
          clientAddress,
          assetScale,
          assetCode
        }),
        serverAddress
      }))
    }
  }
}
