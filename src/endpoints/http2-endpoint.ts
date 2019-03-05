import { Endpoint } from '../types/endpoint'
import { RequestHandler } from '../types/channel'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply, isFulfill } from 'ilp-packet'
import { ClientHttp2Session, connect, constants } from 'http2'
import { IlpRequestHandler } from '../types/middleware'

export interface HttpEndpointOpts {
  url: string
}

export class Http2Endpoint implements Endpoint<IlpPrepare, IlpReply> {

  private client: ClientHttp2Session
  private path: string
  private origin: string
  private protocol: string

  private _handler: IlpRequestHandler

  constructor (opts: HttpEndpointOpts) {
    const url = new URL(opts.url)

    this.path = url.pathname
    this.origin = url.origin
    this.protocol = url.protocol.substring(0, url.protocol.length - 1)

    // Setup connection to the other side
    this.client = connect(this.origin)
    this.client.on('error', (err) => console.error(err))
  }

  private async sendIlpPacket (packet: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const req = this.client.request({
        [constants.HTTP2_HEADER_SCHEME]: this.protocol,
        [constants.HTTP2_HEADER_METHOD]: constants.HTTP2_METHOD_POST,
        [constants.HTTP2_HEADER_PATH]: `/${this.path}`
      })

      let data: Buffer[] = []
      req.on('data', (chunk) => {
        data.push(chunk)
      })
      req.on('error', (error) => { console.log(error) })
      req.on('end', () => {
        resolve(Buffer.concat(data))
      })
      req.end(packet)
    })
  }

  public async sendOutgoingRequest (request: IlpPrepare, sentCallback?: (() => void) | undefined): Promise<IlpReply> {
    const replyPromise = this.sendIlpPacket(serializeIlpPrepare(request))
    if (sentCallback) sentCallback()
    return deserializeIlpReply(await replyPromise)
  }

  public setIncomingRequestHandler (handler: RequestHandler<IlpPrepare, IlpReply>): this {
    this._handler = handler
    return this
  }

  public async handlePacket (prepare: Buffer): Promise<Buffer> {
    if (this._handler) {
      const packet = deserializeIlpPrepare(prepare)
      return serializeIlpReply(await this._handler(packet))
    } else {
      throw new Error('Handler has not been set')
    }
  }

  close () {
    this.client.close()
  }
}
