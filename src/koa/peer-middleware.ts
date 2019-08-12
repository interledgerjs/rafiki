/**
 * Attach peer info to the context
 */
import * as Koa from 'koa'
import { PeerInfo } from '../types'

export interface PeerState {
  peers: {
    readonly incoming: PeerInfo
    readonly outgoing: PeerInfo
  }
}

export interface PeerMiddlewareOptions {
  getIncomingPeer: (ctx: Koa.Context) => PeerInfo
  getOutgoingPeer: (ctx: Koa.Context) => PeerInfo
}

export type PeerMiddleWare = Koa.Middleware<PeerState>

export function peerMiddleWare ({ getIncomingPeer, getOutgoingPeer }: PeerMiddlewareOptions): PeerMiddleWare {

  return async function peer (ctx: Koa.ParameterizedContext<PeerState>, next: () => Promise<any>) {

    ctx.state.peers = {
      get incoming () {
        return getIncomingPeer(ctx)
      },
      get outgoing () {
        return getOutgoingPeer(ctx)
      }
    }

    await next()

  }
}
