import * as WebSocket from 'ws'
import { IlpStreamEndpoint, IlpEndpoint, IlpStreamEndpointOptions } from './request-stream'
import { log } from '../winston'
const logger = log.child({ component: 'ws-endpoint' })

export function createIlpWebSocketEndpoint (ws: WebSocket, options?: IlpStreamEndpointOptions): IlpEndpoint {

  const endpoint = new IlpStreamEndpoint(options)

  ws.on('message', (data: WebSocket.Data) => {
    if (Buffer.isBuffer(data)) {
      try {
        endpoint.write(data)
      } catch (e) {
        logger.error('unable to handle message')
        ws.close(1008, 'unable to handle message')
      }
    } else {
      logger.error('unexpected message type')
      ws.close(1003, 'unexpected message type')
    }
  })

  endpoint.on('data', (chunk: any) => {
    ws.send(chunk)
  })

  return endpoint
}
