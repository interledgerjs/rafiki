import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import Connector from '../src/connector'
import ValidateFulfillmentMiddleware from '../src/middleware/business/validate-fulfillment'
import { PeerInfo } from '../src/types/peer'
import MockIlpEndpoint from './mocks/mockIlpEndpoint';
import { IlpPrepare, IlpFulfill, serializeIlpFulfill } from 'ilp-packet';
import * as ILDCP from 'ilp-protocol-ildcp'
import MockMiddleware from './mocks/mockMiddleware';

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
      const vfMiddleware = new ValidateFulfillmentMiddleware()
      const middleware = {
        'validate-fulfillment': vfMiddleware
      }

      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      const vfMiddlewareSpy = sinon.spy(vfMiddleware, 'applyToPipelines')

      connector.addPeer(peerInfo, endpoint, middleware)

      sinon.assert.calledOnce(vfMiddlewareSpy)
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

      await connector.addPeer(peerInfo, endpoint, {})
      const reply = await endpoint.handler(packet)
  
      assert.isOk(ILDCPStub.called)
      assert.strictEqual(reply.data.toString(), 'test data')
      ILDCPStub.restore()
    })

    it('adds ccp protocol middleware to pipelines', async function () {
      const ccpRouteControlFulfill = {
        fulfillment: Buffer.alloc(32),
        data: Buffer.from('test data')
      }
      const packet: IlpPrepare = {
        amount: '100',
        executionCondition: Buffer.alloc(32),
        expiresAt: new Date(),
        destination: 'peer.route.control',
        data: Buffer.alloc(0)
      }
      const handleRouteControlStub = sinon.stub(connector, <any>'_handleCcpRouteControl').resolves(ccpRouteControlFulfill)
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)

      await connector.addPeer(peerInfo, endpoint, {})
      const reply = await endpoint.handler(packet)
  
      assert.isOk(handleRouteControlStub.called)
      assert.strictEqual(reply.data.toString(), 'test data')
    })

    it('connects ilp-endpoint to incoming data pipeline', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      let isConnected: boolean = false
      const mockMiddleware = new MockMiddleware(async (packet: IlpPrepare) => {
        isConnected = true
        return fulfillPacket
      })
      await connector.addPeer(peerInfo, endpoint, {'mock': mockMiddleware})

      await endpoint.handler({} as IlpPrepare)

      assert.isOk(isConnected)
    })

    it('connects outgoing data pipeline to endpoints request', async function () {
      let isConnected: boolean = false
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => {
        isConnected = true
        return fulfillPacket
      })
      await connector.addPeer(peerInfo, endpoint, {})

      await connector.sendIlpPacket(preparePacket)

      assert.isOk(isConnected)
    })

    it('adds peer controller into peer controller map', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      const mockMiddleware = new MockMiddleware(async (packet: IlpPrepare) => fulfillPacket)
      await connector.addPeer(peerInfo, endpoint, {'mock': mockMiddleware})

      const peerController = connector.getPeer('alice')

      assert.isOk(peerController)
    })
  })


})