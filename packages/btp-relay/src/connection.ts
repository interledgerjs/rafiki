import Websocket from 'ws'
import { EventEmitter } from 'events'
import {
  BtpPacket,
  deserialize,
  MIME_APPLICATION_OCTET_STREAM,
  serialize,
  serializeResponse,
  Type,
  TYPE_MESSAGE
} from 'btp-packet'
import { genRequestId } from './utils'

export type DataHandlerFunction = (data: Buffer) => Promise<Buffer>

export class Connection extends EventEmitter {
  _dataHandler: DataHandlerFunction

  constructor (private socket: Websocket, private emitter: EventEmitter) {
    super()
    socket.on('message', this._handleMessage.bind(this))
  }

  registerDataHandle (handler: DataHandlerFunction): void {
    this._dataHandler = handler
  }

  async _handleMessage (data: Buffer): Promise<void> {
    const btpPacket = deserialize(data)
    console.log('gotBtpPacket', btpPacket.requestId)
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
    console.log('sendingBtpPacket', requestId)
    this.socket.send(btpPacket)
    const btpResponse = await this.getWSResponse('request_' + requestId)
    return btpResponse.data.protocolData[0].data
  }

  private async getWSResponse (requestId: string): Promise<BtpPacket> {
    return new Promise(resolve => {
      this.emitter.once(requestId, data => {
        resolve(data)
      })
    })
  }
}
