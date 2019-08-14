import { log } from '../winston'
import { RafikiContext } from '../rafiki'
const logger = log.child({ component: 'http-endpoint' })

export function ilpClientMiddleware () {
  return async function ilpClient (ctx: RafikiContext) {
    ctx.state.ilp.rawRes = await ctx.state.peers.outgoing.client.send(ctx.state.ilp.outgoingRawReq)
  }
}
