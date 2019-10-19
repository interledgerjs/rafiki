import Websocket, { Server as WSServer } from 'ws'
import { Server as HttpServer } from 'http'
import {
  BtpPacket,
  deserialize,
  serializeError,
  serializeResponse
} from 'btp-packet'
import createLogger from 'pino'
import { EventEmitter } from 'events'
import Koa from 'koa'
import getRawBody from 'raw-body'
import { Connection } from './connection'
import got from 'got'
const logger = createLogger()

// export interface ServerOptions {
//
// }

export class Server {
  private emitter = new EventEmitter()
  private koa = new Koa()
  private koaServer: HttpServer
  private wsServer: WSServer
  private connections = new Map<string, Connection>()

  constructor () {
    this.wsServer = new WSServer({
      port: 8080
    })
    this.setupKoa()
    this.setupWss()
  }

  setupKoa (): void {
    this.koa.use(async ctx => {
      const buffer = await getRawBody(ctx.req)

      // Need a mapping mechanism to find the socket
      const connection = this.connections.get('shh_its_a_secret')

      if (connection) {
        ctx.body = await connection.send(buffer)
      }
    })
  }

  setupWss (): void {
    this.wsServer.on('connection', (socket: Websocket) => {
      logger.info('got connection')
      let authPacket: BtpPacket

      // socket.on('close', (code: number) => {
      //   logger.info('incoming websocket closed. code=' + code)
      //   this._emitDisconnect()
      // })

      // socket.on('error', (err: Error) => {
      //   logger.debug('incoming websocket error. error=', err)
      //   this._emitDisconnect()
      // })

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
          // if (this._incomingWs) {
          //   this._closeIncomingSocket(this._incomingWs, authPacket)
          // }
          // this._incomingWs = socket
          socket.send(serializeResponse(authPacket.requestId, []))
          const connection = new Connection(socket, this.emitter)
          connection.registerDataHandle((data: Buffer) => {
            return got
              .post('http://localhost:3030', {
                headers: {
                  'content-type': 'application/octet-stream'
                },
                body: data
              })
              .then((response: any) => Buffer.from(response.body))
          })
          this.connections.set(
            authPacket.data.protocolData[2].data.toString(),
            connection
          )
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
        }
      })
    })
  }

  async listen (): Promise<void> {
    this.koaServer = await this.koa.listen(3031)
  }

  async close (): Promise<void> {
    await Promise.all([this.wsServer.close(), this.koaServer.close()])
  }
}
