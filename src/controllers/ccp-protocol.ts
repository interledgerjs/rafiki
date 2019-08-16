import { deserializeCcpRouteUpdateRequest, serializeCcpResponse, deserializeCcpRouteControlRequest } from 'ilp-protocol-ccp'
import { log } from '../winston'
import { TemporaryApplicationError } from 'ilp-packet/dist/src/errors'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'ccp-protocol' })

/**
 * Intercept CCP messages and send to the router service to handle them
 *
 * TODO: Should be a controller
 */
export function createCcpProtocolController () {
  return async function ccp ({ ilp, services, state: { peers: { incoming } } }: RafikiContext) {
    const peer = await incoming
    switch (ilp.prepare.destination) {
      case 'peer.route.control': {
        logger.silly('received peer.route.control', { request: ilp.prepare })
        try {
          await services.router.handleRouteControl(peer.id, deserializeCcpRouteControlRequest(ilp.prepare.raw))
          ilp.respond(serializeCcpResponse())
        } catch (error) {
          throw new TemporaryApplicationError('Unable to handle CCP Route Control', Buffer.from(''))
        }
        break
      }
      case 'peer.route.update': {
        logger.silly('received peer.route.update', { request: ilp.prepare })
        try {
          await services.router.handleRouteUpdate(peer.id, deserializeCcpRouteUpdateRequest(ilp.prepare.raw))
          ilp.respond(serializeCcpResponse())
        } catch (error) {
          throw new TemporaryApplicationError('Unable to handle CCP Route Update', Buffer.from(''))
        }
        break
      }
      default: {
        throw new Error('Unrecognized CCP message')
      }
    }
  }
}
