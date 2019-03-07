import { Transform, TransformCallback } from 'stream'
import { serializeMessageFrame, MESSAGE_ID_LENGTH, MessageFrameTypeGuard } from './frame'

export type MessageStreamCodecs<Request, Reply> =
  MessageStreamDecoders<Request, Reply>
  & MessageStreamEncoders<Request, Reply>

export interface MessageStreamDecoders<Request, Reply> {
  isMessage: MessageFrameTypeGuard<Request, Reply>
  decode: (payload: Buffer) => Request | Reply
  nextFrameSize: (readBuffer: Buffer, cursor: number) => number | undefined
}

export interface MessageStreamEncoders<Request, Reply> {
  isMessage: MessageFrameTypeGuard<Request, Reply>
  encode: (payload: Request | Reply) => Buffer,
}

/**
 * Decodes a MessageFrame
 */
export class MessageDecoder<Request,Reply> extends Transform {
  constructor ({ decode, nextFrameSize, isMessage }: MessageStreamDecoders<Request, Reply>) {

    let _readBuffer = Buffer.allocUnsafe(0)
    let _readCursor = 0
    super({
      allowHalfOpen: false,
      readableObjectMode: true,
      transform (chunk: any, encoding: string, callback: TransformCallback): void {
        if (Buffer.isBuffer(chunk)) {
          _readBuffer = getReadBuffer(_readBuffer, _readCursor, chunk)
          _readCursor = 0

          let messageSize = nextFrameSize(_readBuffer, _readCursor)
          while (messageSize !== undefined && _readBuffer.length >= messageSize) {
            const message = {
              id: _readBuffer.readUInt32BE(_readCursor),
              payload: decode(_readBuffer.slice(_readCursor + MESSAGE_ID_LENGTH, _readCursor + messageSize))
            }
            if (isMessage(message)) {
              this.push(message)
            } else {
              this.emit('error', new Error('invalid object decoded from underlying stream. ' + JSON.stringify(message)))
            }
            _readCursor += messageSize
            messageSize = nextFrameSize(_readBuffer, _readCursor)
          }
          callback()
        } else {
          this.destroy(new Error('unexpected type read from underlying stream'))
        }
      }
    })
  }
}

/**
 * Encodes a MessageFrame
 */
export class MessageEncoder<Request, Reply> extends Transform {
  constructor ({ encode, isMessage }: MessageStreamEncoders<Request, Reply>) {
    super({
      allowHalfOpen: false,
      writableObjectMode: true,
      transform (chunk: any, encoding: string, callback: TransformCallback): void {
        if (isMessage(chunk)) {
          callback(undefined, serializeMessageFrame(chunk, encode))
        } else {
          callback(new Error('unexpected message type.'))
        }
      }
    })
  }
}

/**
 * Given an old buffer of data, the last position of the cursor and a new chunk of data, return a new buffer that contains any unread data from the old buffer followed by the new data.
 *
 * @param buffer The read buffer from the last read operation
 * @param cursor The position of the cursor after the last read operation
 * @param chunk The new data to be added to the buffer
 */
export function getReadBuffer (buffer: Buffer, cursor: number, chunk: Buffer): Buffer {
  const unreadBytes = buffer.length - cursor
  if (unreadBytes > 0) {
    const newBuffer = Buffer.allocUnsafe(unreadBytes + chunk.length)
    buffer.copy(newBuffer, 0, cursor)
    chunk.copy(newBuffer, unreadBytes, 0)
    return newBuffer
  } else {
    return chunk
  }
}
