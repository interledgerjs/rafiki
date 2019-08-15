import {Context} from 'koa'
import { peerMiddleWare } from "../../src/koa/peer-middleware"
import { AppServicesFactory } from '../factories/app-services'

import {PeerInfoFactory} from '../factories/peerInfo'
import {PeerFactory} from '../factories/peer'
import {Rafiki, RafikiContext} from '../../src/rafiki'

describe('Peer Middleware Test',() => {
  test('Correctly binds functions to get peers to context state', async () => {
    const ctx = {
      state: {},
      assert: (value: any, errorCode: number, errorMessage: string) => {
        if (!value) {
          expect(errorCode).toBe(401)
          throw new Error(errorMessage)
        }
      },
      services: {
        peers: {
          get: (id: string) => {
            if(id === 'incomingPeer') return incomingPeer
            if(id === 'outgoingPeer') return outgoingPeer
            else throw new Error('Peer not found')
          }
        }
      }
    } as RafikiContext
    const incomingPeer = PeerFactory.build({
      info: PeerInfoFactory.build({
        id: 'incomingPeer'
      })
    })
    const outgoingPeer = PeerFactory.build({
      info: PeerInfoFactory.build({
        id: 'outgoingPeer'
      })
    })

    const getIncomingPeerId = (ctx: RafikiContext) => {
      return incomingPeer.info.id
    }
    // Get outgoing peerId by querying connector routing table
    const getOutgoingPeerId = (ctx: RafikiContext) => {
      return outgoingPeer.info.id
    }

    const middleware = peerMiddleWare({
      getIncomingPeerId,
      getOutgoingPeerId
    })

    //call the middleware
    await middleware(ctx, async () => {return})
    expect(ctx.state.peers.incoming).toEqual(incomingPeer)
    expect(ctx.state.peers.outgoing).toEqual(outgoingPeer)
  })
})
