import Websocket, { Server as WSServer } from 'ws'
import {
  BtpPacket,
  deserialize,
  serializeError,
  serializeResponse
} from 'btp-packet'
import createLogger from 'pino'
import { EventEmitter } from 'events'
import { Connection } from './connection'
import { extractProtocolData } from './utils'
const logger = createLogger()

export type AuthFunction = (
  username: string,
  password: string
) => Promise<string>

export interface ServerOptions {
  authenticate: AuthFunction;
  port?: number;
}

export class Server extends EventEmitter {
  private emitter = new EventEmitter()
  private wsServer: WSServer
  private readonly authenticate: AuthFunction
  private connections = new Map<string, Connection>()

  constructor (opts: ServerOptions) {
    super()
    this.authenticate = opts.authenticate
    this.wsServer = new WSServer({
      port: opts.port || 8080
    })
    this.setupWss()
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

          const username = extractProtocolData(
            'auth_username',
            authPacket.data.protocolData
          )
          const password = extractProtocolData(
            'auth_token',
            authPacket.data.protocolData
          )

          if (!username || !password) {
            throw new Error('username and password not found')
          }

          const uniqueId = await this.authenticate(
            username.toString(),
            password.toString()
          )

          // If duplicate connection exists, close it
          if (this.connections.has(uniqueId)) {
            const conn = this.connections.get(uniqueId)
            await conn!.close()
          }

          socket.send(serializeResponse(authPacket.requestId, []))

          const connection = new Connection(socket, uniqueId, this.emitter)
          this.connections.set(uniqueId, connection)
          this.emit('connection', connection)
        } catch (err) {
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
    return Promise.resolve()
  }

  async close (): Promise<void> {
    await Promise.all([this.wsServer.close()])
  }
}
