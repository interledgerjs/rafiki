import { serve as ildcpServe } from 'ilp-protocol-ildcp'
import { SELF_PEER_ID } from '../constants'
import { RafikiContext } from '../rafiki'

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 */
export function createIldcpProtocolController () {
  return async function ildcp (ctx: RafikiContext) {
    const { log, services, ilp, state: { peers : { incoming } } } = ctx
    if (ilp.prepare.destination === 'peer.config') {

      const peer = await incoming
      const { id, relation } = peer
      const { assetCode, assetScale } = await services.accounts.get(id)
      if (relation !== 'child') {
        log.warn('received ILDCP request for peer that is not a child', { peerId: id, relation })
        throw new Error('Can\'t generate address for a peer that isn\t a child.')
      }

      // TODO: Ensure we get at least length > 0
      const serverAddress = services.router.getAddresses(SELF_PEER_ID)[0]
      const clientAddress = services.router.getAddresses(id)[0]

      log.info('responding to ILDCP request from child', { peerId: id, address: clientAddress })

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
    } else {
      ctx.throw('Invalid address in ILDCP request')
    }
  }
}
