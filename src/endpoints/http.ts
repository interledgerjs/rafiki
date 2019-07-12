import { Endpoint } from '../types/endpoint'
import axios from 'axios'
import { RequestHandler } from '../types/request-stream'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply } from 'ilp-packet'
import { IlpRequestHandler } from '../types/rule'
import { log } from '../winston'
import { HttpOpts } from '.'
const logger = log.child({ component: 'http2-endpoint' })

export class HttpEndpoint implements Endpoint<IlpPrepare, IlpReply> {

  private path: string
  private origin: string
  private authToken: string

  private _handler: IlpRequestHandler

  constructor (opts: HttpOpts) {
    if (opts.peerUrl) {
      const url = new URL(opts.peerUrl)

      this.path = url.pathname
      this.origin = url.origin
      this.authToken = opts.peerAuthToken || ''
    }
  }

  private async sendIlpPacket (packet: Buffer): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      // No peerURL was set, cant send outgoing packet
      if (!this.origin) {
        logger.error('No peer URL set for outgoing HTTP Endpoint')
        reject()
      }
      const { data } = await axios.post(`${this.origin}${this.path}`, packet, { headers: { 'Authorization': `Bearer ${this.authToken}` }, responseType: 'arraybuffer' })
      resolve(data)
    })
  }

  public async sendOutgoingRequest (request: IlpPrepare, sentCallback?: (() => void) | undefined): Promise<IlpReply> {
    const replyPromise = this.sendIlpPacket(serializeIlpPrepare(request))
    if (sentCallback) sentCallback()
    const result = await replyPromise.catch(error => {
      logger.error('error in sending outgoing packet', error)
    })
    return deserializeIlpReply(result as Buffer)
  }

  public setIncomingRequestHandler (handler: RequestHandler<IlpPrepare, IlpReply>): this {
    this._handler = handler
    return this
  }

  public async handleIncomingRequest (packet: Buffer): Promise<Buffer> {
    const prepare = deserializeIlpPrepare(packet)
    return serializeIlpReply(await this._handler(prepare))
  }

}
