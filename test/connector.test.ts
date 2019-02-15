import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import Connector from '../src/connector'
import ValidateFulfillmentMiddleware from '../src/middleware/business/validate-fulfillment'
import { PeerInfo } from '../src/types/peer'
import MockIlpEndpoint from './mocks/mockIlpEndpoint';
import { IlpPrepare, IlpFulfill } from 'ilp-packet';
import CcpMiddleware, { CcpMiddlewareServices } from '../src/middleware/protocol/ccp';
import { Ildcp as IldcpMiddleware, IldcpMiddlewareServices } from '../src/middleware/protocol/ildcp';

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

    it('adds protocol middleware to pipelines', async function () {
      const endpoint = new MockIlpEndpoint(async (packet: IlpPrepare) => fulfillPacket)
      const vfMiddlewareSpy = sinon.spy(vfMiddleware, 'applyToPipelines')

      connector.addPeer(peerInfo, endpoint, middleware)

      sinon.assert.calledOnce(vfMiddlewareSpy)
    })

    it('connects pipelines to ilp-endpoint', async function () {

    })

    it('connects data pipelines to sendIlpPacket', async function () {

    })

    it('adds peer controller into peer controller map', async function () {

    })

    it('binds changedPrefixes onto peer controller', async function () {

    })
  })


})