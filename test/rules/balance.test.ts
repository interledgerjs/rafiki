import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpReject, IlpFulfill } from 'ilp-packet';
import { PeerInfo } from '../../src/types/peer';
import { BalanceRule } from '../../src/rules/balance'
import { Stats } from '../../src/services/stats';
import { setPipelineReader } from '../../src/types/rule';
import { MAX_UINT_64 } from '../../src/constants';
import { InMemoryBalance } from '../../src';

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Balance Rule', function () {
    let balanceRule: BalanceRule
    let stats: Stats
    let balance: InMemoryBalance

    const peerInfo: PeerInfo = {
      id: 'harry',
      relation: 'peer',
      assetScale: 9,
      assetCode: 'XRP',
      rules: [
        {
          name: 'balance',
          minimum: -50n,
          maximum: MAX_UINT_64,
          settleThreshold: MAX_UINT_64,
          settleTo: 0n
        }
      ],
      protocols: [],
      settlement: {
        url: 'http://test.settlement/ilp',
        ledgerAddress: 'r4SJQA3bXPBK6bMBwZeRhwGRemoRX7WjeM'
      }
    }

    beforeEach( async function () {
      stats = new Stats()
      balance = new InMemoryBalance({minimum: peerInfo.rules[0]['minimum'], maximum: peerInfo.rules[0]['maximum']})
      balanceRule = new BalanceRule({ peerInfo, stats, balance })
    })

    describe('instantiation', function () {
      it('creates account on the settlement engine', async function () {
        const addAccountStub = sinon.stub(balanceRule.settlementEngineInterface, 'addAccount').resolves()

        await balanceRule.startup()

        sinon.assert.calledOnce(addAccountStub)
        sinon.assert.calledWith(addAccountStub, peerInfo)
      })
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

      it('passes peer.settle messages onto settlement engine', async function () {
        const mockSettlementMessage: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'peer.settle',
          data: Buffer.alloc(0)
        }
        const fulfillPacket: IlpFulfill = {
          fulfillment: Buffer.from(''),
          data: Buffer.from('')
        }
        const incoming = setPipelineReader('incoming', balanceRule, async () => fulfillPacket)
        const handleMessageSpy = sinon.stub(balanceRule.settlementEngineInterface, 'handleMessage')

        await incoming(mockSettlementMessage)

        sinon.assert.calledWith(handleMessageSpy, peerInfo.id, mockSettlementMessage)
      })

      it('returns a fulfill for peer.settle messages ?')
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

    describe('shutdown', function () {
      it('removes account on the settlement engine', async function () {
        const removeAccountStub = sinon.stub(balanceRule.settlementEngineInterface, 'removeAccount').resolves()

        await balanceRule.shutdown()

        sinon.assert.calledOnce(removeAccountStub)
        sinon.assert.calledWith(removeAccountStub, peerInfo.id)
      })
    })

})