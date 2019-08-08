import { Endpoint } from '../types/endpoint'
import axios, { AxiosRequestConfig } from 'axios'
import { ParameterizedContext as KoaContext } from 'koa'
import { RequestHandler } from '../types/request-stream'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply } from 'ilp-packet'
import { IlpRequestHandler } from '../types/rule'
import { log } from '../winston'
const logger = log.child({ component: 'http-endpoint' })

export interface HttpEndpointConfig {
  peerUrl?: string,
  peerAuthToken?: string
}

export class HttpEndpoint implements Endpoint<IlpPrepare, IlpReply> {

  private _remoteUrl?: string
  private _axiosConfig: AxiosRequestConfig
  private _handler: IlpRequestHandler

  constructor ({ peerAuthToken, peerUrl }: HttpEndpointConfig) {
    this._remoteUrl = (peerUrl) ? new URL(peerUrl).toString() : undefined
    this._axiosConfig = { responseType: 'arraybuffer' }
    if (peerAuthToken) this._axiosConfig.headers = { 'Authorization': `Bearer ${peerAuthToken}` }
  }

  private async sendHttpRequestToRemote (data: Buffer): Promise<Buffer> {
    if (!this._remoteUrl) {
      logger.error('No peer URL set for outgoing HTTP Endpoint')
      throw new Error('No URL set for remote peer')
    }
    return (await axios.post<Buffer>(this._remoteUrl.toString(), data, this._axiosConfig)).data
  }

  public async sendOutgoingRequest (request: IlpPrepare, sentCallback?: (() => void) | undefined): Promise<IlpReply> {
    const replyPromise = this.sendHttpRequestToRemote(serializeIlpPrepare(request))
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

  /**
   * Koa middleware to handle the ILP prepare packet
   */
  public async handleIncomingRequest (ctx: KoaContext, next: () => Promise<any>) {
    ctx.assert(ctx.state.requestPacket, 500, 'No ILP packet in request')
    ctx.state.replyPacket = await this._handler(ctx.state.requestPacket, ctx.state.user)
    await next()
  }

}
