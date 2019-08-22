import { deserializeCcpRouteUpdateRequest, serializeCcpResponse, deserializeCcpRouteControlRequest } from 'ilp-protocol-ccp'
import { TemporaryApplicationError } from 'ilp-packet/dist/src/errors'
import { RafikiContext } from '../rafiki'

/**
 * Intercept CCP messages and send to the router service to handle them
 *
 * TODO: Should be a controller
 */
export function createCcpProtocolController () {
  return async function ccp ({ services: { logger }, request, response, services, state: { peers: { incoming } } }: RafikiContext) {
    const peer = await incoming
    switch (request.prepare.destination) {
      case 'peer.route.control': {
        logger.trace('received peer.route.control', { request: request.prepare })
        try {
          await services.router.handleRouteControl(peer.id, deserializeCcpRouteControlRequest(request.rawPrepare))
          response.rawReply = serializeCcpResponse()
        } catch (error) {
          throw new TemporaryApplicationError('Unable to handle CCP Route Control', Buffer.from(''))
        }
        break
      }
      case 'peer.route.update': {
        logger.trace('received peer.route.update', { request })
        try {
          await services.router.handleRouteUpdate(peer.id, deserializeCcpRouteUpdateRequest(request.rawPrepare))
          response.rawReply = serializeCcpResponse()
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
