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
export function createIncomingCcpProtocolMiddleware () {
  return async ({ services, state: { ilp, peers: { incoming } } }: RafikiContext, next: () => Promise<any>) => {
    const { info } = await incoming
    switch (ilp.req.destination) {
      case 'peer.route.control': {
        logger.silly('received peer.route.control', { request: ilp.req })
        try {
          await services.router.handleRouteControl(info.id, deserializeCcpRouteControlRequest(ilp.rawReq))
          ilp.rawRes = serializeCcpResponse()
        } catch (error) {
          throw new TemporaryApplicationError('Unable to handle CCP Route Control', Buffer.from(''))
        }
        break
      }
      case 'peer.route.update': {
        logger.silly('received peer.route.update', { request: ilp.req })
        try {
          await services.router.handleRouteUpdate(info.id, deserializeCcpRouteUpdateRequest(ilp.rawReq))
          ilp.rawRes = serializeCcpResponse()
        } catch (error) {
          throw new TemporaryApplicationError('Unable to handle CCP Route Update', Buffer.from(''))
        }
        break
      }
      default: {
        await next()
      }
    }
  }
}
