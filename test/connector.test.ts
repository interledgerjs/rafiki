import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {Connector} from '../src'
import {PeerInfo} from '../src/types'
import {MockIlpEndpoint} from './mocks/mockIlpEndpoint'
import {Errors, IlpFulfill, IlpPrepare} from 'ilp-packet'
import {CcpProtocol} from '../src/protocols/ccp'
import {IldcpProtocol} from '../src/protocols'

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
    rules: [],
    protocols: [
      {
        name: 'ccp',
        sendRoutes: false,
        receiveRoutes: false
      },
      {
        name: 'ildcp'
      }
    ]
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
  })

  afterEach(function () {
    Array.from(connector.getPeerList()).forEach(peer => connector.removePeer(peer))
  })

  describe('instantiation', function () {

    it('adds self as a peer', function () {
      const peers = connector.getPeerList()

      assert.deepEqual(peers, ['self'])
    })

    it('sets up Echo protocol in pipeline', function() {
      const peerRule = connector.getPeerRules('self')

      assert.include(peerRule!.map(mw => mw.constructor.name), 'EchoProtocol')
    })

  })

  describe('addPeer', function () {

    it('adds protocols to peer', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint)
      
      const peerRule = connector.getPeerRules(peerInfo.id)
      assert.isNotNull(peerRule)
      assert.include(peerRule!.map(mw => mw.constructor.name), 'IldcpProtocol')
      assert.include(peerRule!.map(mw => mw.constructor.name), 'CcpProtocol')
    })

    it.skip('adds heartbeat rule to peer', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint)
      
      const peerRule = connector.getPeerRules(peerInfo.id)
      assert.isNotNull(peerRule)
      assert.include(peerRule!.map(mw => mw.constructor.name), 'HeartbeatRule')
    })
    
    it('sets ilp-endpoints incoming request handler', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      const setIncomingRequestHandlerSpy = sinon.spy(endpoint, 'setIncomingRequestHandler')

      await connector.addPeer(peerInfo, endpoint)

      sinon.assert.calledOnce(setIncomingRequestHandlerSpy)
    })

    it('connects the incoming data pipeline to sendIlpPacket', async function () {
      connector.addOwnAddress('test.connie')
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      const sendIlpPacketSpy = sinon.spy(connector, 'sendIlpPacket')
      await connector.addPeer(peerInfo, endpoint)

      await endpoint.mockIncomingRequest(preparePacket)

      sinon.assert.calledOnce(sendIlpPacketSpy)
    })

    it('connects outgoing data pipeline to endpoints request', async function () {
      connector.addOwnAddress('test.connie')
      let isConnected: boolean = false
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => {
        isConnected = true
        return fulfillPacket
      })
      await connector.addPeer(peerInfo, endpoint)

      await connector.sendIlpPacket(preparePacket)

      assert.isOk(isConnected)
    })

    it('starts protocols', async function () {
      const ccpStartSpy = sinon.spy(CcpProtocol.prototype, 'startup')
      const ildcpStartSpy = sinon.spy(IldcpProtocol.prototype, 'startup')
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint)
      
      sinon.assert.calledOnce(ccpStartSpy)
      sinon.assert.calledOnce(ildcpStartSpy)
    })

    it('adds child peer to routing table', async function () {
      const addRouteSpy = sinon.spy(connector.routeManager, 'addRoute')
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      
      connector.addOwnAddress('test.connie')

      await connector.addPeer(peerInfo, endpoint)
      
      sinon.assert.calledWith(addRouteSpy, { path: [], peer: "alice", prefix: "test.connie.alice" })
    })
  })

  describe('remove peer', function () {
    beforeEach(async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint)
    })
    it('shuts down the peer protocols', async function () {
      const peerRule = connector.getPeerRules(peerInfo.id)
      const shutdownSpies = peerRule!.map(mw => sinon.spy(mw, 'shutdown'))

      await connector.removePeer(peerInfo.id)

      shutdownSpies.forEach(spy => sinon.assert.calledOnce(spy))
    })

    it('deletes peer protocols from map', async function () {
      assert.isNotEmpty(connector.getPeerRules(peerInfo.id))

      await connector.removePeer(peerInfo.id)

      assert.isUndefined(connector.getPeerRules(peerInfo.id))
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
      connector.addOwnAddress('test.connie')
      const bobPeerInfo: PeerInfo = {
        id: 'bob',
        relation: 'peer',
        assetScale: 2,
        assetCode: 'USD',
        rules: [],
        protocols: []
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
      await connector.addPeer(peerInfo, aliceEndpoint)
      await connector.addPeer(bobPeerInfo, bobEndpoint)

      const reply = await connector.sendIlpPacket(preparePacket) // packet addressed to alice

      assert.strictEqual(reply.data.toString(), 'reply from alice')
    })

    it('throws error if address is not in routing table', async function () {
      const bobPeerInfo: PeerInfo = {
        id: 'bob',
        relation: 'peer',
        assetScale: 2,
        assetCode: 'USD',
        rules: [],
        protocols: []
      }
      const bobEndpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      await connector.addPeer(bobPeerInfo, bobEndpoint)

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
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await conn.addPeer(peerInfo, endpoint)

      assert.deepEqual(conn.getPeerList(), ['self', 'alice'])
    })

    it('returns only self if not other peers added', async function () {
      assert.deepEqual(conn.getPeerList(), ['self'])
    })
  })

  it('throws a peer unreachable error when the endpoint fails to send outgoing packet', async function () {
    connector.addOwnAddress('test.connie')
    const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
    endpoint.connected = false
    await connector.addPeer(peerInfo, endpoint)

    try {
      await endpoint.mockIncomingRequest(preparePacket)
    } catch (e) {
      assert.equal(e.ilpErrorCode, codes.T01_PEER_UNREACHABLE)
      return
    }
    assert.fail()
  })

  describe('addOwnAddress', function () {
    it('points address to self peer with a default weight of 500', function () {
      connector.addOwnAddress('test.harry')
  
      assert.equal(connector.routingTable.nextHop('test.harry'), 'self')
      assert.equal(connector.routingTable.getRoutingTable()['items']['test.harry'].weight, 500)
    })

    it('points address to self peer with a prescribed weighting', async function () {
      connector.addOwnAddress('test.harry', 1000)
  
      assert.equal(connector.routingTable.nextHop('test.harry'), 'self')
      assert.equal(connector.routingTable.getRoutingTable()['items']['test.harry'].weight, 1000)
    })

    it('can add multiple addresses pointing to self with different weightings', async function () {
      connector.addOwnAddress('test.harry', 100)
      connector.addOwnAddress('test.rafiki', 200)

      assert.equal(connector.routingTable.nextHop('test.harry'), 'self')
      assert.equal(connector.routingTable.nextHop('test.rafiki'), 'self')
      assert.equal(connector.routingTable.getRoutingTable()['items']['test.harry'].weight, 100)
      assert.equal(connector.routingTable.getRoutingTable()['items']['test.rafiki'].weight, 200)
    })
  })

  describe('getOwnAddresses', async function () {
    it('returns empty array if there are no addresses', async function () {
      assert.deepEqual(connector.getOwnAddresses(), [])
    })

    it('returns array of addresses ordered by weighting', async function () {
      connector.addOwnAddress('test.harry', 200)
      connector.addOwnAddress('test.rafiki', 100)
      
      assert.deepEqual(connector.getOwnAddresses(), ['test.harry', 'test.rafiki'])
    })
  })

  describe('getOwnAddress', function () {
    it('returns highest weighted address', async function () {
      connector.addOwnAddress('test.harry', 200)
      connector.addOwnAddress('test.rafiki', 100)
      
      assert.equal(connector.getOwnAddress(), 'test.harry')
    })

    it('returns unknown if there are no addresses', async function () {      
      assert.equal(connector.getOwnAddress(), 'unknown')
    })
  })

  describe('removeAddress', async function () {
    it('removes the specified address', async function () {
      connector.addOwnAddress('test.rafiki')
      assert.deepEqual(connector.getOwnAddresses(), ['test.rafiki'])

      connector.removeAddress('test.rafiki')

      assert.isEmpty(connector.getOwnAddresses())
      assert.equal(connector.getOwnAddress(), 'unknown')
    })

    it('does nothing if address doesn\'t exist', async function () {
      connector.addOwnAddress('test.rafiki')
      
      connector.removeAddress('test.harry')
      
      assert.deepEqual(connector.getOwnAddresses(), ['test.rafiki'])
      assert.equal(connector.getOwnAddress(), 'test.rafiki')
    })
  })
})
