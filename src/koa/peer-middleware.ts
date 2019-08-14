/**
 * Attach peer info to the context
 */
import { RafikiContext } from '../rafiki'
import { Peer } from '../services/peers'

export interface PeerState {
  peers: {
    readonly incoming: Peer
    readonly outgoing: Peer
  }
}

export interface PeerMiddlewareOptions {
  getIncomingPeerId: (ctx: RafikiContext) => string
  getOutgoingPeerId: (ctx: RafikiContext) => string
}

export const defaultGetIncomingPeerId = (ctx: RafikiContext): string => {
  ctx.assert(ctx.state.user, 401)
  return ctx.state.user! // Waiting on Sir Anders (https://github.com/microsoft/TypeScript/pull/32695)
}

export const defaultGetOutgoingPeerId = (ctx: RafikiContext): string => {
  ctx.assert(ctx.state.ilp.req.destination, 500)
  return ctx.services.connector.getPeerForAddress(ctx.state.ilp.req.destination)
}

const defaultMiddlewareOptions: PeerMiddlewareOptions = {
  getIncomingPeerId: defaultGetIncomingPeerId,
  getOutgoingPeerId: defaultGetOutgoingPeerId
}

export function peerMiddleWare ({ getIncomingPeerId, getOutgoingPeerId }: PeerMiddlewareOptions = defaultMiddlewareOptions) {

  return async function peer (ctx: RafikiContext, next: () => Promise<any>) {

    let incomingPeer: Peer | undefined = undefined
    let outgoingPeer: Peer | undefined = undefined
    ctx.state.peers = {
      get incoming () {
        if (incomingPeer) return incomingPeer
        incomingPeer = ctx.services.peers.getOrThrow(getIncomingPeerId(ctx))
        return incomingPeer
      },
      get outgoing () {
        if (outgoingPeer) return outgoingPeer
        outgoingPeer = ctx.services.peers.getOrThrow(getOutgoingPeerId(ctx))
        return outgoingPeer
      }
    }
    await next()
  }
}
