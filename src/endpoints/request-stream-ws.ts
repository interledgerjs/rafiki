import * as WebSocket from 'ws'
import { IlpStreamEndpoint, IlpEndpoint, IlpStreamEndpointOptions } from './request-stream'

export function createIlpWebSocketEndpoint (ws: WebSocket, options?: IlpStreamEndpointOptions): IlpEndpoint {

  const endpoint = new IlpStreamEndpoint(options)

  ws.on('message', (data: WebSocket.Data) => {
    if (Buffer.isBuffer(data)) {
      try {
        endpoint.write(data)
      } catch (e) {
        ws.close(1008, 'unable to handle message')
      }
    } else {
      ws.close(1003, 'unexpected message type')
    }
  })

  endpoint.on('data', (chunk: any) => {
    ws.send(chunk)
  })

  return endpoint
}
