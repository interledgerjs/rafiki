import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import Connector from '../src/connector'
import { ValidateFulfillmentMiddleware } from '../src/middleware/business/validate-fulfillment'
import { PeerInfo } from '../src/types/peer'
import MockIlpEndpoint from './mocks/mockIlpEndpoint';
import { IlpPrepare, IlpFulfill, serializeIlpFulfill } from 'ilp-packet';
import * as ILDCP from 'ilp-protocol-ildcp'
import { MockMiddleware } from './mocks/mockMiddleware';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Connector', function () {
  let connector: Connector
  const peerInfo: PeerInfo = {
    id: 'alice',
    relation: 'peer',
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
  })

  describe('addPeer', function () {

    it('adds business logic middleware to pipelines', async function () {
      const middleware = [new ValidateFulfillmentMiddleware()]
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      connector.addPeer(peerInfo, endpoint, middleware)
      // TODO - Check that middleware was bound
    })

    it('adds ildcp protocol middleware to pipelines', async function () {
      const IldcpFulfill = {
        fulfillment: Buffer.alloc(32),
        data: Buffer.from('test data')
      }
      const packet: IlpPrepare = {
        amount: '100',
        executionCondition: Buffer.alloc(32),
        expiresAt: new Date(),
        destination: 'peer.config',
        data: Buffer.alloc(0)
      }
      const ILDCPStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IldcpFulfill))
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint, [])
      const reply = await endpoint.mockIncomingRequest(packet)
  
      assert.isOk(ILDCPStub.called)
      assert.strictEqual(reply.data.toString(), 'test data')
      ILDCPStub.restore()
    })

    // TODO: Should be better way to test the pipeline if CCP is added
    
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
        await connector.sendIlpPacket(preparePacket) // packet addressed to alice
      } catch (e) {
        assert.strictEqual(e.message, "Can't route the request due to no route found for given prefix")
        return
      }

      assert.fail('Did not throw error for not having address in routing table')
    })
  })
})
