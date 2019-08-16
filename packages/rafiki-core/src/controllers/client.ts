import { log } from '../winston'
import { RafikiContext } from '../rafiki'
const logger = log.child({ controller: 'client' })

export function createClientController () {
  return async function ilpClient (ctx: RafikiContext) {
    ctx.ilp.respond(await (await ctx.state.peers.outgoing).send(ctx.ilp.outgoingPrepare.raw))
  }
}
