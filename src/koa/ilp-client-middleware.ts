import axios from 'axios'
import { ParameterizedContext } from 'koa'
import { log } from '../winston'
import { IlpState } from './ilp-packet-middleware'
import { PeerState } from './peer-middleware'
import { AppServices } from '../services';
const logger = log.child({ component: 'http-endpoint' })

export interface HttpClientConfig {
  peerUrl: string,
  peerAuthToken?: string
}

export function ilpClientMiddleware (services: AppServices) {
  return async function ilpClient (ctx: ParameterizedContext<PeerState & IlpState>) {

    ctx.assert(ctx.state.peers.outgoing, 500, 'No outgoing peer in ctx')
    const client = services.clients.get(ctx.state.peers.outgoing.id)

    if (!client) {
      logger.error('No peer URL set for outgoing HTTP Endpoint')
      throw new Error('No URL set for remote peer')
    }

    ctx.state.ilp.rawRes = await client.send(ctx.state.ilp.outgoingRawReq)
  }
}
