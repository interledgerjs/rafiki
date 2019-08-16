/**
 * Attach peer info to the context
 */
import { RafikiContext } from '../rafiki'
import { Peer } from '../services/peers'

export interface PeerState {
  peers: {
    readonly incoming: Promise<Peer>
    readonly outgoing: Promise<Peer>
  }
}

export interface PeerMiddlewareOptions {
  getIncomingPeerId?: (ctx: RafikiContext) => string
  getOutgoingPeerId?: (ctx: RafikiContext) => string
}

const defaultGetIncomingPeerId = (ctx: RafikiContext): string => {
  ctx.assert(ctx.state.user && ctx.state.user.sub, 401)
  return ctx.state.user!.sub! // Waiting on Sir Anders (https://github.com/microsoft/TypeScript/pull/32695)
}

const defaultGetOutgoingPeerId = (ctx: RafikiContext): string => {
  ctx.assert(ctx.ilp.prepare.destination, 500)
  return ctx.services.router.getPeerForAddress(ctx.ilp.prepare.destination)
}

const defaultMiddlewareOptions: PeerMiddlewareOptions = {
  getIncomingPeerId: defaultGetIncomingPeerId,
  getOutgoingPeerId: defaultGetOutgoingPeerId
}

export function createPeerMiddleware (config: PeerMiddlewareOptions = defaultMiddlewareOptions) {

  const getIncomingPeerId = (config && config.getIncomingPeerId) ? config.getIncomingPeerId : defaultGetIncomingPeerId
  const getOutgoingPeerId = (config && config.getOutgoingPeerId) ? config.getOutgoingPeerId : defaultGetOutgoingPeerId

  return async function peer (ctx: RafikiContext, next: () => Promise<any>) {

    let incomingPeer: Promise<Peer> | undefined = undefined
    let outgoingPeer: Promise<Peer> | undefined = undefined
    ctx.state.peers = {
      get incoming () {
        if (incomingPeer) return incomingPeer
        incomingPeer = ctx.services.peers.get(getIncomingPeerId(ctx))
        return incomingPeer
      },
      get outgoing () {
        if (outgoingPeer) return outgoingPeer
        outgoingPeer = ctx.services.peers.get(getOutgoingPeerId(ctx))
        return outgoingPeer
      }
    }
    await next()
  }
}
