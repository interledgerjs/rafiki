import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpReject, IlpFulfill } from 'ilp-packet';
import { PeerInfo } from '../../src/types/peer';
import { InMemoryBalanceRule } from '../../src/rules/in-memory-balance'
import { Stats } from '../../src/services/stats';
import { setPipelineReader } from '../../src/types/rule';
import { MAX_UINT_64 } from '../../src/constants';

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Balance Rule', function () {
    let balanceRule: InMemoryBalanceRule
    let stats: Stats

    const peerInfo: PeerInfo = {
      id: 'harry',
      relation: 'peer',
      assetScale: 9,
      assetCode: 'XRP',
      rules: [
        {
          name: 'balance',
          minimum: 0n,
          maximum: MAX_UINT_64,
          settleThreshold: MAX_UINT_64,
          settleTo: 0n
        }
      ],
      protocols: []
    }

    beforeEach( async function () {
      stats = new Stats()
      balanceRule = new InMemoryBalanceRule({ peerInfo, stats })
    })

    describe('instantiation', function () {

    })

    describe('incoming packets', function () {
      
      it('successful packet increments the balance', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const fulfillPacket: IlpFulfill = {
          fulfillment: Buffer.from(''),
          data: Buffer.from('')
        }
        assert.equal(balanceRule.getStatus().balance, '0')
        
        const sendOutgoing = setPipelineReader('incoming', balanceRule, async () => fulfillPacket)

        await sendOutgoing(preparePacket)
        const status = balanceRule.getStatus()
        assert.equal(status.balance, '49')
      })

      it('failed packet does not increment balance', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const rejectPacket: IlpReject = {
          code: 'T01',
          message: 'reject',
          triggeredBy: 'g.nexthop',
          data: Buffer.from('')
        }
        assert.equal(balanceRule.getStatus().balance, '0')
        
        const sendOutgoing = setPipelineReader('incoming', balanceRule, async () => rejectPacket)

        await sendOutgoing(preparePacket)
        assert.equal(balanceRule.getStatus().balance, '0')
      })
    })

    describe('outgoing packets', function () {
      it('successful outgoing decrements the balance', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const fulfillPacket: IlpFulfill = {
          fulfillment: Buffer.from(''),
          data: Buffer.from('')
        }
        assert.equal(balanceRule.getStatus().balance, '0')
        
        const sendOutgoing = setPipelineReader('outgoing', balanceRule, async () => fulfillPacket)

        await sendOutgoing(preparePacket)
        const status = balanceRule.getStatus()
        assert.equal(status.balance, '-49')
      })

      it('failed packet does not increment balance', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const rejectPacket: IlpReject = {
          code: 'T01',
          message: 'reject',
          triggeredBy: 'g.nexthop',
          data: Buffer.from('')
        }
        assert.equal(balanceRule.getStatus().balance, '0')
        
        const sendOutgoing = setPipelineReader('outgoing', balanceRule, async () => rejectPacket)

        await sendOutgoing(preparePacket)
        assert.equal(balanceRule.getStatus().balance, '0')
      })
    })

    describe('settlement', function() {

      it.skip('sending a packet that reduces balance to within threshold should trigger settlement ', async function(done) {
        const peerInfo: PeerInfo = {
          id: 'harry',
          relation: 'peer',
          assetScale: 9,
          assetCode: 'XRP',
          rules: [
            {
              name: 'balance',
              minimum: -25n,
              maximum: 25n,
              settleThreshold: 10n,
              settleTo: 0n
            }
          ],
          protocols: []
        }
        balanceRule = new InMemoryBalanceRule({ peerInfo, stats })

        const preparePacket: IlpPrepare = {
          amount: '16',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'g.harry',
          data: Buffer.alloc(0)
        }
        const fulfillPacket: IlpFulfill = {
          fulfillment: Buffer.from(''),
          data: Buffer.from('')
        }

        const sendOutgoing = setPipelineReader('outgoing', balanceRule, async (packet) => {
          if(packet.destination == 'peer.settle') {
            done()
          }
          return fulfillPacket
        })

        await sendOutgoing(preparePacket)
      })

      it('does not forward on peer.settle messages on incoming pipeline', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'peer.settle',
          data: Buffer.alloc(0)
        }
        
        const sendOutgoing = setPipelineReader('incoming', balanceRule, async () => Promise.reject())

        await sendOutgoing(preparePacket)
      })

      it('modifies the balance by the amount on incoming peer.settle packet', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'peer.settle',
          data: Buffer.alloc(0)
        }
        
        const sendOutgoing = setPipelineReader('incoming', balanceRule, async () => Promise.reject())

        await sendOutgoing(preparePacket)
        assert.equal(balanceRule.getStatus().balance, '-49')
      })

    })
})