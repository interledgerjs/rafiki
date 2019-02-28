import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import Connector from '../src/connector'
import { PeerInfo } from '../src/types/peer'
import MockIlpEndpoint from './mocks/mockIlpEndpoint';
import { IlpPrepare, IlpFulfill, serializeIlpFulfill } from 'ilp-packet';
import { MockMiddleware } from './mocks/mockMiddleware';
import { Errors } from 'ilp-packet'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT
const { codes } = Errors

describe('Connector', function () {
  let connector: Connector
  const peerInfo: PeerInfo = {
    id: 'alice',
    relation: 'child',
    assetScale: 2,
    assetCode: 'USD',
  }
  const preparePacket = {
    amount: '52',
    executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
    expiresAt: new Date(START_DATE + 2000),
    destination: 'test.connie.alice',
    data: Buffer.alloc(0)
  }
  const fulfillPacket: IlpFulfill = {
    fulfillment: Buffer.from('ILPHaxsILPHaxsILPHaxsILPHILPHaxs'),
    data: Buffer.alloc(0)
  }

  beforeEach(function () {
    connector = new Connector()
    connector.setOwnAddress('test.connie')
  })

  afterEach(function () {
    Array.from(connector.getPeerList()).forEach(peer => connector.removePeer(peer))
  })

  describe('instantiation', function () {

    it('adds self as a peer', function () {
      const peers = connector.getPeerList()

      assert.deepEqual(peers, ['self'])
    })

    it('sets up Echo middleware in pipeline', function() {
      const peerMiddleware = connector.getPeerMiddleware('self')

      assert.include(peerMiddleware!.map(mw => mw.constructor.name), 'EchoMiddleware')
    })

  })

  describe('addPeer', function () {

    it('adds business logic middleware to peer middleware', async function () {
      const middleware = [new MockMiddleware(async (packet: IlpPrepare) => fulfillPacket)]
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint, middleware)
      
      const peerMiddleware = connector.getPeerMiddleware(peerInfo.id)
      assert.isNotNull(peerMiddleware)
      assert.include(peerMiddleware!.map(mw => mw.constructor.name), 'MockMiddleware')
    })

    it.skip('adds heartbeat middleware to peer middleware', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint, [])
      
      const peerMiddleware = connector.getPeerMiddleware(peerInfo.id)
      assert.isNotNull(peerMiddleware)
      assert.include(peerMiddleware!.map(mw => mw.constructor.name), 'HeartbeatMiddleware')
    })
    it('adds ildcp protocol middleware to peer middleware', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint, [])
      
      const peerMiddleware = connector.getPeerMiddleware(peerInfo.id)
      assert.isNotNull(peerMiddleware)
      assert.include(peerMiddleware!.map(mw => mw.constructor.name), 'IldcpMiddleware')
    })
    
    it('connects ilp-endpoint to incoming data pipeline', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      let isConnected: boolean = false
      const mockMiddleware = new MockMiddleware(async (packet: IlpPrepare) => {
        isConnected = true
        return fulfillPacket
      })
      await connector.addPeer(peerInfo, endpoint, [mockMiddleware])
      await endpoint.mockIncomingRequest({} as IlpPrepare)

      assert.isOk(isConnected)
    })

    it('connects the incoming data pipeline to sendIlpPacket', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      const sendIlpPacketSpy = sinon.spy(connector, 'sendIlpPacket')
      
      await connector.addPeer(peerInfo, endpoint, [])
      await endpoint.mockIncomingRequest(preparePacket)

      sinon.assert.calledOnce(sendIlpPacketSpy)
    })

    it('connects outgoing data pipeline to endpoints request', async function () {
      let isConnected: boolean = false
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => {
        isConnected = true
        return fulfillPacket
      })
      await connector.addPeer(peerInfo, endpoint, [])

      await connector.sendIlpPacket(preparePacket)

      assert.isOk(isConnected)
    })

    it('starts peer middleware', async function () {
      const middleware = [new MockMiddleware(async (packet: IlpPrepare) => fulfillPacket)]
      const startSpy = sinon.spy(middleware[0], 'startup')
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint, middleware)
      
      sinon.assert.calledOnce(startSpy)
    })

    it('adds child peer to routing table', async function () {
      const middleware = [new MockMiddleware(async (packet: IlpPrepare) => fulfillPacket)]
      const addRouteSpy = sinon.spy(connector.routeManager, 'addRoute')
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      const peerInfo: PeerInfo = {
        id: 'alice',
        relation: 'child',
        assetScale: 2,
        assetCode: 'USD',
      }
      connector.setOwnAddress('test.connie')

      await connector.addPeer(peerInfo, endpoint, middleware)
      
      sinon.assert.calledWith(addRouteSpy, { path: [], peer: "alice", prefix: "test.connie.alice" })
    })
  })

  describe('remove peer', function () {
    beforeEach(async function () {
      const middleware = [new MockMiddleware(async (packet: IlpPrepare) => fulfillPacket)]
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint, middleware)
    })
    it('shuts down the peer middleware', async function () {
      const peerMiddleware = connector.getPeerMiddleware(peerInfo.id)
      const shutdownSpies = peerMiddleware!.map(mw => sinon.spy(mw, 'shutdown'))

      await connector.removePeer(peerInfo.id)

      shutdownSpies.forEach(spy => sinon.assert.calledOnce(spy))
    })

    it('deletes peer middleware from map', async function () {
      assert.isNotEmpty(connector.getPeerMiddleware(peerInfo.id))

      await connector.removePeer(peerInfo.id)

      assert.isUndefined(connector.getPeerMiddleware(peerInfo.id))
    })

    it('removes the peer\'s outgoingPacketHandler', async function () {
      assert.isOk(connector.outgoingIlpPacketHandlerMap.get(peerInfo.id))

      await connector.removePeer(peerInfo.id)

      assert.isNotOk(connector.outgoingIlpPacketHandlerMap.get(peerInfo.id))
    })

    it('tells route manager to remove the peer', async function () {
      const removePeerSpy = sinon.spy(connector.routeManager, 'removePeer')

      await connector.removePeer(peerInfo.id)

      sinon.assert.calledOnce(removePeerSpy)
      sinon.assert.calledWithExactly(removePeerSpy, peerInfo.id)
    })
  })

  describe('sendIlpPacket', function () {
    it('calls the handler for the specified destination', async function () {
      const bobPeerInfo: PeerInfo = {
        id: 'bob',
        relation: 'peer',
        assetScale: 2,
        assetCode: 'USD',
      }
      const bobFulfillPacket = {
        fulfillment: Buffer.from('ILPHaxsILPHaxsILPHaxsILPHILPHaxs'),
        data: Buffer.from('reply from bob')
      }
      const aliceFulfillPacket = {
        fulfillment: Buffer.from('ILPHaxsILPHaxsILPHaxsILPHILPHaxs'),
        data: Buffer.from('reply from alice')
      }
      const bobEndpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => bobFulfillPacket)
      const aliceEndpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => aliceFulfillPacket)
      await connector.addPeer(peerInfo, aliceEndpoint, [])
      await connector.addPeer(bobPeerInfo, bobEndpoint, [])

      const reply = await connector.sendIlpPacket(preparePacket) // packet addressed to alice

      assert.strictEqual(reply.data.toString(), 'reply from alice')
    })

    it('throws error if address is not in routing table', async function () {
      const bobPeerInfo: PeerInfo = {
        id: 'bob',
        relation: 'peer',
        assetScale: 2,
        assetCode: 'USD',
      }
      const bobEndpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      await connector.addPeer(bobPeerInfo, bobEndpoint, [])

      try{
        await connector.sendIlpPacket({...preparePacket, destination: 'g.alice'}) // packet addressed to alice
      } catch (e) {
        assert.strictEqual(e.message, "Can't route the request due to no route found for given prefix")
        return
      }

      assert.fail('Did not throw error for not having address in routing table')
    })
  })

  describe('getPeerList', async function () {
    let conn: Connector

    beforeEach(function () {
      conn = new Connector()
    })

    afterEach(function () {
      Array.from(conn.getPeerList()).forEach(peer => conn.removePeer(peer))
    })

    it('returns array of peer ids', async function () {
      const middleware = [new MockMiddleware(async (packet: IlpPrepare) => fulfillPacket)]
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await conn.addPeer(peerInfo, endpoint, middleware)

      assert.deepEqual(conn.getPeerList(), ['self', 'alice'])
    })

    it('returns only self if not other peers added', async function () {
      assert.deepEqual(conn.getPeerList(), ['self'])
    })
  })

  it('throws a peer unreachable error when the endpoint fails to send outgoing packet', async function () {
    const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
    endpoint.connected = false
    await connector.addPeer(peerInfo, endpoint, [])

    try {
      await endpoint.mockIncomingRequest(preparePacket)
    } catch (e) {
      assert.equal(e.ilpErrorCode, codes.T01_PEER_UNREACHABLE)
      return
    }
    assert.fail()
  })

  it('setOwnAddress adds self to routing table', function () {
    connector.setOwnAddress('g.harry')

    assert.equal(connector.routingTable.nextHop('g.harry'), 'self')
  })
})
