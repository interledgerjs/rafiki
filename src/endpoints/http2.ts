import { Endpoint } from '../types/endpoint'
import { RequestHandler } from '../types/request-stream'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply } from 'ilp-packet'
import { ServerHttp2Stream } from 'http2'
import { IlpRequestHandler } from '../types/rule'
import Http2Client from 'ilp-plugin-http/build/lib/http2' // TODO remove this dependency
import { log } from '../winston'
const logger = log.child({ component: 'http2-endpoint' })
export interface HttpEndpointOpts {
  url: string
}

export class Http2Endpoint implements Endpoint<IlpPrepare, IlpReply> {

  private client: Http2Client
  private path: string
  private origin: string

  private _handler: IlpRequestHandler

  constructor (opts: HttpEndpointOpts) {
    const url = new URL(opts.url)

    this.path = url.pathname
    this.origin = url.origin

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

  public handleIncomingStream (stream: ServerHttp2Stream) {
    let chunks: Array<Buffer> = []
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    stream.on('end', async () => {
      let packet = Buffer.concat(chunks)
      try {
        const prepare = deserializeIlpPrepare(packet)
        let response = serializeIlpReply(await this._handler(prepare))
        stream.end(response)
      } catch (e) {
        logger.error('No handler set for endpoint')
        stream.respond({ ':status': 500 })
        stream.end()
      }
    })
    stream.on('error', (error) => logger.debug('error on incoming stream', { error }))
  }

  close () {
    this.client.close()
  }
}
