import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {deserializeIlpPrepare, IlpPrepare, IlpReply} from 'ilp-packet'
import {CcpProtocol} from '../../../src/protocols/ccp'
import {CcpRouteUpdateRequest, serializeCcpRouteUpdateRequest} from 'ilp-protocol-ccp'
import {setPipelineReader} from '../../../src/types/rule'
import {ForwardingRoutingTable, IncomingRoute, Relation} from 'ilp-routing'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('CCP Rule', function () {
    let ccpRule: CcpProtocol
    const services = {
      isSender: true,
      isReceiver: true,
      peerId: 'harry',
      forwardingRoutingTable: new ForwardingRoutingTable(),
      getPeerRelation: (peerId: string) => 'parent' as Relation,
      getOwnAddress: () => 'g.barry',
      addRoute: (route: IncomingRoute) => {return},
      removeRoute: (peerId: string, prefix: string) => {return},
      getRouteWeight: (peerId: string) => 100
    }

    const ccpUpdateRequest = {
      speaker: 'string',
      routingTableId: '3b069822-a754-4e44-8a60-0f9f7084144d',
      currentEpochIndex: 5,
      fromEpochIndex: 0,
      toEpochIndex: 5,
      holdDownTime: 45000,
      newRoutes: [],
      withdrawnRoutes: new Array<string>(),
    } as CcpRouteUpdateRequest

    const prepareRouteControlPacket: IlpPrepare = deserializeIlpPrepare(serializeCcpRouteUpdateRequest(ccpUpdateRequest))

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
      ccpRule = new CcpProtocol(services)
    })

    describe('peer.route.control packets', function () {
      it('doesn\'t call next for packets with destination of peer.route.control', async function () {
        const sendIncoming = setPipelineReader('incoming', ccpRule, () => {
          assert.fail()
          return Promise.resolve({} as IlpReply)
        })
        await sendIncoming(prepareRouteControlPacket)
      })
    })

    describe('peer.route.update packets', function () {
      it('doesn\'t call next for packets with destination of peer.route.update', async function () {
        const sendIncoming = setPipelineReader('incoming', ccpRule, () => {
          assert.fail()
          return Promise.resolve({} as IlpReply)
        })
        await sendIncoming(prepareRouteUpdatePacket)
      })
    })

    describe('normal packets', function () {
      it('calls next for packets without destination of peer.route.update or peer.route.control', async function (done) {
        const sendIncoming = setPipelineReader('incoming', ccpRule, () => {
          done()
          return Promise.resolve({} as IlpReply)
        })
        await sendIncoming(prepareNormalPacket)
      })
    })

    describe('receiver', function() {
      it('sends a route control message if start method called and receiver defined', function (done) {
        const receiveOutgoing = setPipelineReader('outgoing', ccpRule, (request: IlpPrepare): Promise<IlpReply> => {
          try {
            assert.equal(request.destination, 'peer.route.control')
            assert.equal(request.amount, '0')
            done()
          } catch (error) {
            done(error)
          }
          return Promise.resolve({} as IlpReply)
        })
        ccpRule.startup()
      })

      it('handles a route update message', function () {

      })
    })

    
    describe('sender', function() {

      it('route control message gets handled by ccpSender', function () {
      })

      it('sends CcpRouteUpdate based on the forwardingRoutingTable', function () {

      })
    })
})
