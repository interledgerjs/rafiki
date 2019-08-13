import {Context, ParameterizedContext} from 'koa'
import { peerMiddleWare } from "../../src/koa/peer-middleware"
import { AppServicesFactory } from '../factories/app-services'
import {AuthState} from '../../src/koa/auth-state'
import {IlpState} from '../../src/koa/ilp-packet-middleware'
import {PeerInfoFactory} from '../factories/peerInfo'

describe('Peer Middleware Test',() => {
  test('Correctly binds functions to get peers to context state', async () => {
    const ctx = {
      state: {},
      assert: (value: any, errorCode: number, errorMessage: string) => {
        if (!value) {
          expect(errorCode).toBe(401)
          throw new Error(errorMessage)
        }
      }
    } as Context
    const incomingPeer = PeerInfoFactory.build({
      id: 'incomingPeer'
    })
    const outgoingPeer = PeerInfoFactory.build({
      id: 'outgoingPeer'
    })

    const getIncomingPeerId = (ctx: ParameterizedContext<AuthState>) => {
      return incomingPeer.id
    }
    // Get outgoing peerId by querying connector routing table
    const getOutgoingPeerId = (ctx: ParameterizedContext<IlpState>) => {
      return outgoingPeer.id
    }

    const services = AppServicesFactory.build({
      peers: {
        getOrThrow: (id: string) => {
          if(id == incomingPeer.id) return incomingPeer
          if(id == outgoingPeer.id) return outgoingPeer
          throw new Error('Can not find peer')
        }
      }
    })
    const middleware = peerMiddleWare(services, {
      getIncomingPeerId,
      getOutgoingPeerId
    })

    //call the middleware
    await middleware(ctx, async () => {return})
    expect(ctx.state.peers.incoming).toEqual(incomingPeer)
    expect(ctx.state.peers.outgoing).toEqual(outgoingPeer)
  })
})
