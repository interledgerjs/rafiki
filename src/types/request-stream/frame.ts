/**
 * The message frame for exchanging messages over a byte stream.
 *
 * Each frame has a 32-bit identifier which is used to match a request with a subsequent reply.
 *
 * The payload of the message is an OER encoded ILP packet.
 */
export interface MessageFrame<Request, Reply> {

  /**
   * The message identifier decoded as an unsigned 32-bit integer (Big Endian)
   */
  id: number
  /**
   * The message payload
   */
  payload: Request | Reply
}

export const MESSAGE_ID_LENGTH = 4

export type MessageFrameTypeGuard <Request, Reply> = (object: any) => object is MessageFrame<Request, Reply>
export type Encoder<Request, Reply> = (object: Request | Reply) => Buffer
export type Decoder<Request, Reply> = (object: Buffer) => Request | Reply

/**
 * Test if an object is a valid frame
 *
 * @param object object to test
 * @param isRequest a function to test if the payload is a valid request
 * @param isReply a function to test if the payload is a valid reply
 */
export function isMessageFrame <Request, Reply> (object: any,
  isRequest: (request: any) => request is Request,
  isReply: (request: any) => request is Reply): object is MessageFrame<Request, Reply> {

  return (typeof object.id === 'number')
    && (typeof object.payload !== 'undefined')
    && (isRequest(object.payload) || isReply(object.payload))
}

/**
 * Serialize a frame into a Buffer
 *
 * @param frame A MessageFrame object
 * @param encode a function to encode the payload
 */
export function serializeMessageFrame <Request, Reply> (
  frame: MessageFrame<Request, Reply>,
  encode: (payload: Request | Reply) => Buffer): Buffer {

  const payload = encode(frame.payload)
  const buffer = Buffer.allocUnsafe(MESSAGE_ID_LENGTH + payload.length)
  buffer.writeUInt32BE(frame.id, 0)
  payload.copy(buffer, MESSAGE_ID_LENGTH)
  return buffer
}

/**
 * Deserialize a frame from a Buffer
 *
 * @param data the Buffer containing a serialized MessageFrame
 * @param decode a function to decode the payload
 */
export function deserializeMessageFrame <Request, Reply> (
  data: Buffer,
  decode: (payload: Buffer) => Request | Reply): MessageFrame<Request, Reply> {

  return {
    id: data.readUInt32BE(0),
    payload: decode(data.slice(MESSAGE_ID_LENGTH))
  }
}
