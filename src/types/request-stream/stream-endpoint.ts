import { MessageFrame, isMessageFrame, MessageFrameTypeGuard } from './frame'
import { Endpoint } from '../endpoint'
import { Duplex } from 'stream'
import { MessageDecoder, MessageEncoder, MessageStreamCodecs } from './message-stream'
import { RequestHandler } from '../request-stream'

export const DEFAULT_MAX_TIMEOUT_MS = 5 * 60 * 1000

export interface EndpointCodecs<Request, Reply> extends MessageStreamCodecs<Request, Reply> {
  isRequest: (payload: any) => payload is Request
  getExpiry: (request: Request) => Date
}

/**
 * Constructor options for a new `StreamEndpoint` object.
 */
export interface StreamEndpointOptions<Request, Reply> {

  /**
   * The initial handler for incoming requests.
   */
  handler?: RequestHandler<Request, Reply>

  /**
   * The id to use for the next request.
   *
   * Subsequent requests will use an incrementally higher id until the id reaches 0xffffffff and then it will roll back to 0x00000001.
   * The id 0 is never used to avoid unpredictable behaviour if the value is 'falsey'.
   *
   * If the provided value is > 0xffffffff it will be reset to 0x00000001
   */
  nextRequestId?: number
  /**
   * Max timeout allowed in ILP Prepare packets passed via `request`.
   */
  maxTimeoutMs?: number
}

/**
 * Reference implementation of an Endpoint that is also a `stream.Duplex`.
 *
 * The provided codecs are used to decode/encode data read/written to the Duplex
 */
export class StreamEndpoint<Request, Reply> extends Duplex implements Endpoint<Request, Reply> {
  protected _outgoingMessageStream: MessageEncoder<Request, Reply>
  protected _incomingMessageStream: MessageDecoder<Request, Reply>
  protected _isRequest: (payload: any) => payload is Request
  protected _getExpiry: (request: Request) => Date
  protected _isMessageFrame: MessageFrameTypeGuard<Request, Reply>
  protected _nextRequestId: number
  protected _outgoing: Map<number, { respond: (response: Reply) => void, timeout: NodeJS.Timeout }>
  protected _incoming: Set<number>
  protected _maxTimeoutMs: number
  protected _incomingRequestHandler: RequestHandler<Request, Reply>

  /**
   * Create a new MessageStreamEndpoint using the provided stream as the underlying message stream.
   *
   * @param stream a stream.Duplex that reads/writes `MessageFrame` objects
   * @param options constructor options
   */
  constructor ({ isMessage, isRequest, nextFrameSize, getExpiry, decode, encode }: EndpointCodecs<Request, Reply>, options?: StreamEndpointOptions<Request, Reply>) {

    super({
      allowHalfOpen: false,
      read: (): void => {
        this._outgoingMessageStream.resume()
      },
      write: (chunk: any, encoding?: string, callback?: (error?: Error) => void): void => {
        this._incomingMessageStream.write(chunk, encoding, callback)
      }
    })

    this._isRequest = isRequest
    this._getExpiry = getExpiry
    this._isMessageFrame = isMessage
    this._incoming = new Set()
    this._outgoing = new Map()

    if (options && options.nextRequestId) {
      this._nextRequestId = options.nextRequestId
      if (this._nextRequestId > 0xffffffff) {
        this._nextRequestId = 1
      }
    } else {
      this._nextRequestId = 1
    }

    this._maxTimeoutMs = (options && options.maxTimeoutMs)
      ? options.maxTimeoutMs
      : DEFAULT_MAX_TIMEOUT_MS

    this._outgoingMessageStream = new MessageEncoder<Request, Reply>({ encode, isMessage })
    this._outgoingMessageStream.on('error', (error: any) => {
      this.emit('error', error)
    })
    this._outgoingMessageStream.on('data', (chunk: any) => {
      if (!this.push(chunk)) {
        this._outgoingMessageStream.pause()
      }
    })

    this._incomingMessageStream = new MessageDecoder<Request, Reply>({ decode, isMessage, nextFrameSize })
    this._incomingMessageStream.on('error', (error: any) => {
      this.emit('error', error)
    })
    this._incomingMessageStream.on('data', async (message: MessageFrame<Request, Reply>) => {
      return this._handleMessage(message)
    })

    if (options && options.handler) {
      this._incomingRequestHandler = options.handler
    } else {
      this._incomingRequestHandler = (packet: Request): Promise<Reply> => {
        throw new Error('no request handler for incoming request')
      }
    }
  }

  public sendOutgoingRequest (request: Request, sentCallback?: () => void): Promise<Reply> {
    if (!this._outgoingMessageStream.writable) throw new Error('underlying stream is not writeable')
    const message = this._nextMessage(request)
    const timeoutMs = this._getExpiry(request).valueOf() - Date.now()
    if (timeoutMs > this._maxTimeoutMs || timeoutMs <= 0) {
      throw new Error(`invalid expiresAt in ILP packet. timeoutMs=${timeoutMs}, maxTimeoutMs=${this._maxTimeoutMs}`)
    }
    return new Promise<Reply>((replyCallback, errorCallback) => {
      const timeout = setTimeout(() => {
        this._outgoing.delete(message.id)
        errorCallback(new Error('timed out waiting for response'))
      }, timeoutMs)

      const respond = (reply: Reply) => {
        clearTimeout(timeout)
        this._outgoing.delete(message.id)
        replyCallback(reply)
      }
      this._outgoing.set(message.id, { respond, timeout })
      this._outgoingMessageStream.write(message, sentCallback)
    })
  }

  public setIncomingRequestHandler (handler: RequestHandler<Request, Reply>): this {
    this._incomingRequestHandler = handler
    return this
  }

  private _nextMessage (payload: Request | Reply): MessageFrame<Request, Reply> {
    const id = this._nextRequestId++
    if (this._nextRequestId > 0xffffffff) {
      this._nextRequestId = 1
    }
    return { id, payload }
  }

  private async _handleMessage (message: MessageFrame<Request, Reply>): Promise<void> {
    const { id, payload } = message
    if (this._isRequest(payload)) {

      if (this._incoming.has(id)) {
        this.emit('error', new Error(`duplicate request received for id: ${id}`))
        return
      }

      try {
        this._incoming.add(id)
        const reply = await this._incomingRequestHandler(payload)
        await new Promise<void>((sent) => { this._outgoingMessageStream.write({ id, payload: reply }, () => { sent() }) })
      } catch (e) {
        this.emit('error', e)
      } finally {
        this._incoming.delete(id)
      }
    } else {
      const request = this._outgoing.get(id)
      if (!request) {
        this.emit('error', new Error('unsolicited response message received: ' + JSON.stringify(message)))
      } else {
        request.respond(payload)
      }
    }
  }
}
