import { IlpPrepare, IlpReply, serializeIlpPrepare, isPrepare, isFulfill, isReject, deserializeIlpPacket, IlpAny, serializeIlpFulfill, serializeIlpReject } from 'ilp-packet'
import { StreamEndpoint, StreamEndpointOptions } from '../types/request-stream/stream-endpoint'
import { RequestHandler } from '../types/request-stream'
import { isMessageFrame, MessageFrame } from '../types/request-stream/frame'
import { Endpoint } from '../types/endpoint'

export type IlpRequestHander = RequestHandler<IlpPrepare, IlpReply>

export type IlpEndpoint = Endpoint<IlpPrepare, IlpReply>

function isMessage (object: any): object is MessageFrame<IlpPrepare, IlpReply> {
  return isMessageFrame(object, isRequest, isReply)
}

function isRequest (request: any): request is IlpPrepare {
  return isPrepare(request)
}

function isReply (reply: any): reply is IlpReply {
  return isFulfill(reply) || isReject(reply)
}

function decode (payload: Buffer): IlpAny {
  return deserializeIlpPacket(payload).data
}

function encode (payload: IlpAny): Buffer {
  if (isPrepare(payload)) {
    return serializeIlpPrepare(payload)
  }
  if (isFulfill(payload)) {
    return serializeIlpFulfill(payload)
  }
  return serializeIlpReject(payload)
}

function getExpiry (request: IlpPrepare): Date {
  return request.expiresAt
}

/**
 * Calculates the byte size of the next message that will be read from the buffer.
 *
 * If there is not enough data in the buffer to read a complete message it returns `undefined`
 *
 * @param buffer read buffer
 * @param cursor read cursor
 *
 * Only exported for testing
 */
export function nextFrameSize (buffer: Buffer, cursor: number): number | undefined {
  const LENGTH_OFFSET = 5
  const unreadByteCount = buffer.length - cursor
  if (unreadByteCount > LENGTH_OFFSET) {
    const length = buffer[cursor + LENGTH_OFFSET]
    if ((length & 0x80) === 0x80) {
      const lengthOfLength = length & 0x7f
      if (lengthOfLength === 0) {
        return undefined
      }
      if (unreadByteCount > (LENGTH_OFFSET + 1 + lengthOfLength)) {
        const actualLength = buffer.readUIntBE(cursor + LENGTH_OFFSET + 1, lengthOfLength)
        if (actualLength < 0x80) {
          return undefined
        }
        if (unreadByteCount >= LENGTH_OFFSET + 1 + lengthOfLength + actualLength) {
          return LENGTH_OFFSET + 1 + lengthOfLength + actualLength
        }
      }
      return undefined
    }
    if (unreadByteCount >= LENGTH_OFFSET + 1 + length) {
      return LENGTH_OFFSET + 1 + length
    }
  }
  return undefined
}

export type IlpStreamEndpointOptions = StreamEndpointOptions<IlpPrepare, IlpReply>

/**
 * An implementation of an Endpoint that is also a Duplex that reads and writes `MessageFrame`s containing ILP packets
 */
export class IlpStreamEndpoint extends StreamEndpoint<IlpPrepare, IlpReply> {
  constructor (options?: IlpStreamEndpointOptions) {
    super({ isMessage, isRequest, decode, encode, getExpiry, nextFrameSize }, options)
  }
}

/**
 * A map of handlers than can be used as the RequestHandler for an `IlpEndpoint` where requests are passed to
 * different handlers depending on the ILP Address of the incoming packet.
 */
export class AddressMappedHandlerProvider {

  /**
   * Constructor
   *
   * @param handlers A Map of handlers to pre-load the object with.
   */
  constructor (handlers?: Map<string, IlpRequestHander>) {
    if (handlers) {
      for (const [address, handler] of handlers) {
        this.handlers.set(address, handler)
      }
    }
  }

  /**
   * The Map of handlers consulted when `handleRequest` is called.
   */
  public handlers: Map<string, IlpRequestHander>

  /**
   * The default handler provided when no match is found in the Map for the address of the request.
   */
  public get defaultHandler (): IlpRequestHander | undefined {
    return this.handlers.get('*')
  }

  public set defaultHandler (handler: IlpRequestHander | undefined) {
    if (handler) {
      this.handlers.set('*', handler)
    } else {
      this.handlers.delete('*')
    }
  }

  /**
   * Provide the handler to use for the supplied packet.
   *
   * This implementation will return a handler from the backing Map using the address
   * of the request as the key or the default handler if no match is found.
   *
   * @param request The incoming ILP packet that must be handled
   */
  public async handleRequest (request: IlpPrepare): Promise<IlpReply> {
    if (request.destination.startsWith('peer')) {
      const handler = this.handlers.get(request.destination)
      if (handler) return handler(request)
    }
    const handler = this.handlers.get('*')
    if (handler) return handler(request)

    throw new Error('no handler for request. ' + JSON.stringify(request))
  }
}
