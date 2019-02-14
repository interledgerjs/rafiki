import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import {Pipelines} from '../../../src/types/middleware'
import { IlpPrepare, IlpReply, deserializeIlpFulfill } from 'ilp-packet';
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import CcpMiddleware from '../../../src/middleware/protocol/ccp'
import {serializeCcpResponse} from 'ilp-protocol-ccp'

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('CCP Middleware', function () {
    let pipelines: Pipelines
    let ccpMiddleware: CcpMiddleware

    let handleCcpRouteControl = (packet: IlpPrepare) => Promise.resolve(deserializeIlpFulfill(serializeCcpResponse()))

    const prepareRouteControlPacket: IlpPrepare = {
      amount: '0',
      executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
      expiresAt: new Date(START_DATE + 2000),
      destination: 'peer.route.control',
      data: Buffer.alloc(0)
    }

    const prepareRouteUpdatePacket: IlpPrepare = {
      ...prepareRouteControlPacket,
      destination: 'peer.route.update'
    }

    const prepareNormalPacket: IlpPrepare = {
      ...prepareRouteControlPacket,
      destination: 'mock.bob.1',
      amount: '99'
    }

    beforeEach( async function () {
      ccpMiddleware = new CcpMiddleware({handleCcpRouteControl: handleCcpRouteControl, handleCcpRouteUpdate: handleCcpRouteControl})
      pipelines = await constructPipelines({'ccp' :ccpMiddleware})
    })

    it('adds methods to the correct pipeline', async function() {
      assert.isNotEmpty(pipelines.incomingData.getMethods())
      assert.equal(pipelines.incomingData.getMethods().length, 1)
      assert.isEmpty(pipelines.outgoingData.getMethods())
      assert.isEmpty(pipelines.startup.getMethods())
      assert.isEmpty(pipelines.shutdown.getMethods())
    })

    it('doesn\'t call next for packets with destination of peer.route', async function () {
      let endHandler = (data: IlpPrepare) => {
        assert.fail()
        return Promise.resolve({} as IlpReply)
      }
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)
      const reply = await handler(prepareRouteControlPacket)
    })

    it('calls next for packets without destination of peer.route', async function (done) {
      let endHandler = (data: IlpPrepare) => {
        done()
        return Promise.resolve({} as IlpReply)
      }
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)
      const reply = await handler(prepareNormalPacket)
    })

    it('calls handleCcpRouteControl for peer.route.control messages', async function() {
      const spy = sinon.spy(ccpMiddleware, 'handleCcpRouteControl')
      let endHandler = (data: IlpPrepare) => {
        return Promise.resolve({} as IlpReply)
      }
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)

      await handler(prepareRouteControlPacket)

      sinon.assert.calledOnce(spy)
    })

    it('calls handleCcpRouteUpdate fro peer.route.update messages', async function() {
      const spy = sinon.spy(ccpMiddleware, 'handleCcpRouteUpdate')
      let endHandler = (data: IlpPrepare) => {
        return Promise.resolve({} as IlpReply)
      }
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)

      await handler(prepareRouteUpdatePacket)

      sinon.assert.calledOnce(spy)
    })
})