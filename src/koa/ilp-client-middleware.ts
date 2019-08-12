import axios from 'axios'
import { ParameterizedContext } from 'koa'
import { log } from '../winston'
import { IlpState } from './ilp-packet-middleware'
import { PeerState } from './peer-middleware'
const logger = log.child({ component: 'http-endpoint' })

export interface HttpClientConfig {
  peerUrl: string,
  peerAuthToken?: string
}

export function ilpClientMiddleware (clients: Map<string, HttpClientConfig>) {
  return async function ilpClient (ctx: ParameterizedContext<PeerState & IlpState>) {

    ctx.assert(ctx.state.peers.outgoing, 500, 'No outgoing peer in ctx')
    const config = clients.get(ctx.state.peers.outgoing.id)

    if (!config) {
      logger.error('No peer URL set for outgoing HTTP Endpoint')
      throw new Error('No URL set for remote peer')
    }

    const axiosConfig = { responseType: 'arraybuffer' }
    if (config.peerAuthToken) this._axiosConfig.headers = { 'Authorization': `Bearer ${config.peerAuthToken}` }
    const res = await axios.post<Buffer>(config.peerUrl, ctx.state.ilp.outgoingRawReq, axiosConfig)

    if (res.headers['callback-url']) {
    // TODO - Update config if new value provided in callback-url and callback-auth headers
    }

    ctx.state.ilp.rawRes = res.data
  }
}
