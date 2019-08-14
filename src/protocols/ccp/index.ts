import { Rule } from '../../types'
import { deserializeCcpRouteUpdateRequest, serializeCcpResponse, deserializeCcpRouteControlRequest } from 'ilp-protocol-ccp'
import { log } from '../../winston'
import { TemporaryApplicationError } from 'ilp-packet/dist/src/errors'
const logger = log.child({ component: 'ccp-protocol' })

export class CcpProtocol extends Rule {
  constructor () {
    super({
      incoming: async ({ services, state: { ilp, peers: { incoming: { info } } } }, next) => {
        switch (ilp.req.destination) {
          case 'peer.route.control': {
            logger.silly('received peer.route.control', { request: ilp.req })
            try {
              await services.connector.handleRouteControl(info.id, deserializeCcpRouteControlRequest(ilp.rawReq))
              ilp.rawRes = serializeCcpResponse()
            } catch (error) {
              throw new TemporaryApplicationError('Unable to handle CCP Route Control', Buffer.from(''))
            }
            break
          }
          case 'peer.route.update': {
            logger.silly('received peer.route.update', { request: ilp.req })
            try {
              await services.connector.handleRouteUpdate(info.id, deserializeCcpRouteUpdateRequest(ilp.rawReq))
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
    })
  }

}
