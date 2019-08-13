/**
 * Attach peer info to the context
 */
import * as Koa from 'koa'
import { PeerInfo } from '../types'
import { AppServices } from '../services';

export interface PeerState {
  peers: {
    readonly incoming: PeerInfo
    readonly outgoing: PeerInfo
  }
}

export interface PeerMiddlewareOptions {
  getIncomingPeerId: (ctx: Koa.Context) => string
  getOutgoingPeerId: (ctx: Koa.Context) => string
}

export type PeerMiddleWare = Koa.Middleware<PeerState>

export function peerMiddleWare (services: AppServices, { getIncomingPeerId, getOutgoingPeerId }: PeerMiddlewareOptions): PeerMiddleWare {

  return async function peer (ctx: Koa.ParameterizedContext<PeerState>, next: () => Promise<any>) {

    let incomingPeer: PeerInfo | undefined = undefined
    let outgoingPeer: PeerInfo | undefined = undefined
    ctx.state.peers = {
      get incoming () {
        if (incomingPeer) return incomingPeer
        incomingPeer = services.peers.getOrThrow(getIncomingPeerId(ctx))
        return incomingPeer
      },
      get outgoing () {
        if (outgoingPeer) return outgoingPeer
        outgoingPeer = services.peers.getOrThrow(getOutgoingPeerId(ctx))
        return outgoingPeer
      }
    }
    await next()

  }
}
