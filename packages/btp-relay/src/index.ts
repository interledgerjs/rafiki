import {
  BtpPacket,
  deserialize,
  MIME_APPLICATION_OCTET_STREAM,
  serialize,
  serializeError,
  serializeResponse,
  Type,
  TYPE_MESSAGE
} from 'btp-packet'
import Websocket, { Server } from 'ws'
import createLogger from 'pino'
import { EventEmitter } from 'events'
import got from 'got'
import Koa from 'koa'
import { randomBytes } from 'crypto'
import getRawBody from 'raw-body'
const logger = createLogger()
logger.level = 'trace'

/**
 * Generate a new request id.
 */
function _requestId (): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    randomBytes(4, (err, buf) => {
      if (err) return reject(err)
      resolve(buf.readUInt32BE(0))
    })
  })
}

export function createServer (): Server {
  const koa = new Koa()
  const emitter = new EventEmitter()
  const connections = new Map<string, Websocket>()

  const getWSResponse = (requestId: string): Promise<BtpPacket> => {
    return new Promise(resolve => {
      emitter.once(requestId, data => {
        resolve(data)
      })
    })
  }

  koa.use(async (ctx, next) => {
    const buffer = await getRawBody(ctx.req)
    // Need a mapping mechanism to find the socket
    const socket = connections.get('shh_its_a_secret')
    if (socket) {
      const requestId = await _requestId()
      const btpPacket = serialize({
        type: TYPE_MESSAGE,
        requestId,
        data: {
          protocolData: [
            {
              protocolName: 'ilp',
              contentType: MIME_APPLICATION_OCTET_STREAM,
              data: buffer
            }
          ]
        }
      })
      console.log('sendingBtpPacket', requestId)
      socket.send(btpPacket)
      // await for some emitted event to respond to respond back to server
      const response = await getWSResponse('request_' + requestId)
      const responseBuffer = response.data.protocolData[0].data
      ctx.body = responseBuffer
    }
  })

  const anotherServer = koa.listen(3031)
  const wss: Server = new Server({
    port: 8080
  })

  wss.on('connection', (socket: Websocket) => {
    logger.info('got connection')
    let authPacket: BtpPacket

    socket.on('close', (code: number) => {
      logger.info('incoming websocket closed. code=' + code)
      this._emitDisconnect()
    })

    socket.on('error', (err: Error) => {
      logger.debug('incoming websocket error. error=', err)
      this._emitDisconnect()
    })

    // Do the auth step
    socket.once('message', async (binaryAuthMessage: Buffer) => {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        authPacket = deserialize(binaryAuthMessage)
        logger.trace('got auth packet. packet=%j', authPacket)

        // Its just a buffer
        console.log(authPacket.data.protocolData[2].data.toString())

        // this._validateAuthPacket(authPacket)
        if (this._incomingWs) {
          this._closeIncomingSocket(this._incomingWs, authPacket)
        }
        // this._incomingWs = socket
        socket.send(serializeResponse(authPacket.requestId, []))
        console.log('setting connection')
        connections.set(authPacket.data.protocolData[2].data.toString(), socket)
      } catch (err) {
        // this._incomingWs = undefined
        if (authPacket) {
          const errorResponse = serializeError(
            {
              code: 'F00',
              name: 'NotAcceptedError',
              data: err.message,
              triggeredAt: new Date().toISOString()
            },
            authPacket.requestId,
            []
          )
          socket.send(errorResponse)
        }
        socket.close()
        return
      }

      logger.trace('connection authenticated')
      socket.on('message', async (data: Buffer) => {
        const btpPacket = deserialize(data)
        console.log('gotBtpPacket', btpPacket.requestId)
        if (
          btpPacket.type === Type.TYPE_RESPONSE ||
          btpPacket.type === Type.TYPE_ERROR
        ) {
          emitter.emit('request_' + btpPacket.requestId, btpPacket)
        } else {
          const response = await got
            .post('http://localhost:3030', {
              headers: {
                'content-type': 'application/octet-stream'
              }
            })
            .then((response: any) => Buffer.from(response.body))
          socket.send(
            serializeResponse(btpPacket.requestId, [
              {
                protocolName: 'ilp',
                contentType: MIME_APPLICATION_OCTET_STREAM,
                data: response
              }
            ])
          )
        }
      })
    })
  })

  logger.info(`listening for BTP connections on ${8080}`)
  return wss
}
