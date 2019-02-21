import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpReply, deserializeIlpFulfill } from 'ilp-packet';
import { CcpMiddleware } from '../../../../src/middleware/protocol/ccp'
import {serializeCcpResponse} from 'ilp-protocol-ccp'
import { setPipelineReader } from '../../../../src/types/middleware';
import ForwardingRoutingTable from 'ilp-router/build/ilp-router/forwarding-routing-table';
import { Relation } from 'ilp-router/build/types/relation';

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('CCP Middleware', function () {
    let ccpMiddleware: CcpMiddleware
    const services = {
      isSender: true,
      isReceiver: true,
      peerId: 'harry',
      forwardingRoutingTable: new ForwardingRoutingTable(),
      getPeerRelation: (peerId: string) => 'parent' as Relation,
      getOwnAddress: () => 'g.barry'
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

    describe('peer.route.control packets', function () {
      it('doesn\'t call next for packets with destination of peer.route.control', async function () {
        const sendIncoming = setPipelineReader('incoming', ccpMiddleware, () => {
          assert.fail()
          return Promise.resolve({} as IlpReply)
        })
        await sendIncoming(prepareRouteControlPacket)
      })
    })

    describe('peer.route.update packets', function () {
      it('doesn\'t call next for packets with destination of peer.route.update', async function () {
        const sendIncoming = setPipelineReader('incoming', ccpMiddleware, () => {
          assert.fail()
          return Promise.resolve({} as IlpReply)
        })
        await sendIncoming(prepareRouteUpdatePacket)
      })
    })

    describe('normal packets', function () {
      it('calls next for packets without destination of peer.route.update or peer.route.control', async function (done) {
        const sendIncoming = setPipelineReader('incoming', ccpMiddleware, () => {
          done()
          return Promise.resolve({} as IlpReply)
        })
        await sendIncoming(prepareNormalPacket)
      })
    })

    describe('receiver', function() {
      it('sends a route control message if start method called and receiver defined', function (done) {
        const receiveOutgoing = setPipelineReader('outgoing', ccpMiddleware, (request: IlpPrepare): Promise<IlpReply> => {
          console.log(request)
          try {
            assert.equal(request.destination, 'peer.route.control')
            assert.equal(request.amount, '0')
            done()
          } catch (error) {
            done(error)
          }
          return Promise.resolve({} as IlpReply)
        })
        ccpMiddleware.start()
      })

      it('handles a route update message', function () {

      })
    })

    

    describe('sender', function() {

      it('route control message gets handled by ccpSender', function () {

        console.log(ccpMiddleware.ccpSender)
      })

      it('sends CcpRouteUpdate based on the forwardingRoutingTable', function () {

      })
    })

  
    

    // it('calls handleCcpRouteControl for peer.route.control messages', async function() {
    //   const spy = sinon.spy(services, 'handleCcpRouteControl')
    //   ccpMiddleware = new CcpMiddleware(services)
    //   const sendIncoming = setPipelineReader('incoming', ccpMiddleware, () => {
    //     return Promise.resolve({} as IlpReply)
    //   })

    //   await sendIncoming(prepareRouteControlPacket)
    //   sinon.assert.calledOnce(spy)
    // })

    // it('calls handleCcpRouteUpdate for peer.route.update messages', async function() {
    //   const spy = sinon.spy(services, 'handleCcpRouteUpdate')
    //   ccpMiddleware = new CcpMiddleware(services)
    //   const sendIncoming = setPipelineReader('incoming', ccpMiddleware, () => {
    //     return Promise.resolve({} as IlpReply)
    //   })
    //   await sendIncoming(prepareRouteUpdatePacket)
    //   sinon.assert.calledOnce(spy)
    // })
})