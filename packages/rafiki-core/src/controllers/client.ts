import { RafikiContext } from '../rafiki'

export function createClientController () {
  return async function ilpClient (ctx: RafikiContext) {
    ctx.ilp.respond(await (await ctx.state.peers.outgoing).send(ctx.ilp.outgoingPrepare.raw))
  }
}
