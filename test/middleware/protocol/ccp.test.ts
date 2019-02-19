import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpReply, deserializeIlpFulfill } from 'ilp-packet';
import { CcpMiddleware } from '../../../src/middleware/protocol/ccp'
import {serializeCcpResponse} from 'ilp-protocol-ccp'
import { setPipelineHandler } from '../../../src/types/middleware';

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('CCP Middleware', function () {
    let ccpMiddleware: CcpMiddleware
    const services = {
      handleCcpRouteControl: (packet: IlpPrepare) => Promise.resolve(deserializeIlpFulfill(serializeCcpResponse())),
      handleCcpRouteUpdate: (packet: IlpPrepare) => Promise.resolve(deserializeIlpFulfill(serializeCcpResponse()))
    }

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
      ccpMiddleware = new CcpMiddleware(services)
    })

    it('doesn\'t call next for packets with destination of peer.route', async function () {
      const sendIncoming = setPipelineHandler('incoming', ccpMiddleware, () => {
        assert.fail()
        return Promise.resolve({} as IlpReply)
      })
      await sendIncoming(prepareRouteControlPacket)
    })

    it('calls next for packets without destination of peer.route', async function (done) {
      const sendIncoming = setPipelineHandler('incoming', ccpMiddleware, () => {
        done()
        return Promise.resolve({} as IlpReply)
      })
      await sendIncoming(prepareNormalPacket)
    })

    it('calls handleCcpRouteControl for peer.route.control messages', async function() {
      const spy = sinon.spy(services, 'handleCcpRouteControl')
      const sendIncoming = setPipelineHandler('incoming', ccpMiddleware, () => {
        return Promise.resolve({} as IlpReply)
      })

      await sendIncoming(prepareRouteControlPacket)
      sinon.assert.calledOnce(spy)
    })

    it('calls handleCcpRouteUpdate for peer.route.update messages', async function() {
      const spy = sinon.spy(services, 'handleCcpRouteUpdate')
      const sendIncoming = setPipelineHandler('incoming', ccpMiddleware, () => {
        return Promise.resolve({} as IlpReply)
      })
      await sendIncoming(prepareRouteUpdatePacket)
      sinon.assert.calledOnce(spy)
    })
})