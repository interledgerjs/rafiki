import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import Connector from '../src/connector'
import ValidateFulfillmentMiddleware from '../src/middleware/business/validate-fulfillment'
import { PeerInfo } from '../src/types/peer'
import MockIlpEndpoint from './mocks/mockIlpEndpoint';
import { IlpPrepare, IlpFulfill } from 'ilp-packet';
import CcpMiddleware from '../src/middleware/protocol/ccp';
import { Ildcp as IldcpMiddleware } from '../src/middleware/protocol/ildcp';
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

    it.skip('adds protocol middleware to pipelines', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      const ildcpMiddlewareSpy = sinon.spy(IldcpMiddleware.prototype, 'applyToPipelines')
      const ccpMiddlewareSpy = sinon.spy(CcpMiddleware.prototype, 'applyToPipelines')

      connector.addPeer(peerInfo, endpoint, {})

      sinon.assert.calledOnce(ildcpMiddlewareSpy)
      sinon.assert.calledOnce(ccpMiddlewareSpy)
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
        console.log('in request ')
        isConnected = true
        return fulfillPacket
      })
      await connector.addPeer(peerInfo, endpoint, {})

      const reply = await connector.sendIlpPacket(preparePacket)

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