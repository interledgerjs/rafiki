import { Endpoint } from '../types/endpoint'
import { RequestHandler } from '../types/request-stream'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply, isFulfill } from 'ilp-packet'
import { ClientHttp2Session, connect, constants } from 'http2'
import { IlpRequestHandler } from '../types/rule'
import Http2Client from 'ilp-plugin-http/build/lib/http2' // TODO remove this dependency

export interface HttpEndpointOpts {
  url: string
}

export class Http2Endpoint implements Endpoint<IlpPrepare, IlpReply> {

  private client: Http2Client
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
    this.client = new Http2Client(this.origin, {
      maxRequestsPerSession: 100
    })
  }

  private async sendIlpPacket (packet: Buffer): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const result = await this.client.fetch(this.path, { method: 'POST', body: packet, headers: {} })
      resolve(result.buffer())
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
