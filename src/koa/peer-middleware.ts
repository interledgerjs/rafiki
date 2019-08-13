/**
 * Attach peer info to the context
 */
import { PeerInfo } from '../types'
import { RafikiContext } from '../rafiki'

export interface PeerState {
  peers: {
    readonly incoming: PeerInfo
    readonly outgoing: PeerInfo
  }
}

export interface PeerMiddlewareOptions {
  getIncomingPeerId: (ctx: RafikiContext) => string
  getOutgoingPeerId: (ctx: RafikiContext) => string
}

export function peerMiddleWare ({ getIncomingPeerId, getOutgoingPeerId }: PeerMiddlewareOptions) {

  return async function peer (ctx: RafikiContext, next: () => Promise<any>) {

    let incomingPeer: PeerInfo | undefined = undefined
    let outgoingPeer: PeerInfo | undefined = undefined
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
