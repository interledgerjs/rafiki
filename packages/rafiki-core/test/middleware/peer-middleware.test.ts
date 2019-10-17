import { createContext } from '@interledger/rafiki-utils'
import { createPeerMiddleware } from '../../src/middleware/peer'
import {
  PeerFactory,
  IlpPrepareFactory,
  RafikiServicesFactory
} from '../../src/factories'
import { RafikiContext } from '../../src/rafiki'
import { InMemoryPeers } from '../../src/services'
import { ZeroCopyIlpPrepare } from '../../src/middleware/ilp-packet'

describe('Peer Middleware', () => {
  const incomingPeerInfo = PeerFactory.build({ id: 'incomingPeer' })
  const outgoingPeerInfo = PeerFactory.build({ id: 'outgoingPeer' })
  const peers = new InMemoryPeers()
  const router = {
    getAddresses: jest.fn(),
    getPeerForAddress: jest
      .fn()
      .mockImplementation((address: string) => 'outgoingPeer'),
    getRoutingTable: jest.fn(),
    handleRouteControl: jest.fn(),
    handleRouteUpdate: jest.fn()
  }
  const rafikiServices = RafikiServicesFactory.build({ router }, { peers })

  beforeAll(async () => {
    await peers.add(incomingPeerInfo)
    await peers.add(outgoingPeerInfo)
  })

  test('the default getOutgoingPeer asks the router for the next peer', async () => {
    const middleware = createPeerMiddleware()
    const next = jest.fn()
    const ctx = createContext<any, RafikiContext>()
    ctx.services = rafikiServices
    ctx.request.prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({ destination: 'test.rafiki.outgoingPeer' })
    )

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const outgoingPeer = await ctx.peers.outgoing

    expect(router.getPeerForAddress).toHaveBeenCalled()
    expect(outgoingPeer).toEqual(await peers.get('outgoingPeer'))
  })

  test('the default getIncomingPeer looks for the user on the ctx state', async () => {
    const middleware = createPeerMiddleware()
    const next = jest.fn()
    const ctx = createContext<any, RafikiContext>()
    ctx.services = rafikiServices
    ctx.state.user = { sub: 'incomingPeer' }
    ctx.request.prepare = new ZeroCopyIlpPrepare(IlpPrepareFactory.build())

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const incomingPeer = await ctx.peers.incoming

    expect(incomingPeer).toEqual(await peers.get('incomingPeer'))
  })

  test('correctly binds functions to get peers', async () => {
    const ctx = createContext<any, RafikiContext>()
    const next = jest.fn()
    ctx.services = rafikiServices
    ctx.state.user = { sub: 'incomingPeer' }
    const middleware = createPeerMiddleware({
      getIncomingPeerId: ctx => 'outgoingPeer',
      getOutgoingPeerId: ctx => 'incomingPeer'
    })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(await ctx.peers.incoming).toEqual(await peers.get('outgoingPeer'))
    expect(await ctx.peers.outgoing).toEqual(await peers.get('incomingPeer'))
  })
})
