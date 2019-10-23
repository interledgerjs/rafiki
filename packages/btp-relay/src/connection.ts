import Websocket from 'ws'
import { EventEmitter } from 'events'
import {
  deserialize,
  MIME_APPLICATION_OCTET_STREAM,
  serialize,
  serializeResponse,
  Type,
  TYPE_ERROR,
  TYPE_MESSAGE,
  TYPE_RESPONSE
} from 'btp-packet'
import { genRequestId } from './utils'
import { BtpPacketData } from 'ilp-plugin-btp'

export type DataHandlerFunction = (data: Buffer) => Promise<Buffer>

export class Connection extends EventEmitter {
  id: string
  _dataHandler: DataHandlerFunction

  constructor (
    private socket: Websocket,
    id: string,
    private emitter: EventEmitter
  ) {
    super()
    this.id = id
    socket.on('message', this._handleMessage.bind(this))
    socket.on('close', () => {
      this.emit('close')
    })
    socket.on('error', error => {
      this.emit('error', error)
    })
  }

  registerDataHandle (handler: DataHandlerFunction): void {
    this._dataHandler = handler
  }

  async _handleMessage (data: Buffer): Promise<void> {
    const btpPacket = deserialize(data)
    if (
      btpPacket.type === Type.TYPE_RESPONSE ||
      btpPacket.type === Type.TYPE_ERROR
    ) {
      this.emitter.emit('request_' + btpPacket.requestId, btpPacket)
    } else {
      const response = await this._dataHandler(
        btpPacket.data.protocolData[0].data
      )
      this.socket.send(
        serializeResponse(btpPacket.requestId, [
          {
            protocolName: 'ilp',
            contentType: MIME_APPLICATION_OCTET_STREAM,
            data: response
          }
        ])
      )
    }
  }

  async send (data: Buffer): Promise<Buffer> {
    const requestId = await genRequestId()

    let listener: any
    let timer: NodeJS.Timer
    const response = new Promise<BtpPacketData>((resolve, reject) => {
      const callback = (type: number, data: BtpPacketData) => {
        switch (type) {
          case TYPE_RESPONSE:
            resolve(data)
            clearTimeout(timer)
            break

          case TYPE_ERROR:
            reject(new Error(JSON.stringify(data)))
            clearTimeout(timer)
            break

          default:
            throw new Error('Unknown BTP packet type: ' + type)
        }
      }
      listener = this.once('request_' + requestId, callback)
    })

    const btpPacket = serialize({
      type: TYPE_MESSAGE,
      requestId,
      data: {
        protocolData: [
          {
            protocolName: 'ilp',
            contentType: MIME_APPLICATION_OCTET_STREAM,
            data: data
          }
        ]
      }
    })

    this.socket.send(btpPacket)

    const timeout = new Promise<Buffer>((resolve, reject) => {
      timer = setTimeout(() => {
        this.removeListener('request_' + requestId, listener)
        reject(new Error(requestId + ' timed out'))
      }, 30000)
    })

    const ilpResponse = response.then(
      (btpPacket): Buffer => {
        return btpPacket.protocolData[0].data
      }
    )

    return Promise.race([ilpResponse, timeout])
  }

  close () {
    this.socket.close()
  }
}
