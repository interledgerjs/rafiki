import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {getLocal, Mockttp} from 'mockttp'
import {IlpFulfill, IlpPrepare, IlpReject, isFulfill, isReject} from 'ilp-packet'
import {PeerInfo} from '../../src/types/peer'
import {BalanceRule} from '../../src/rules/balance'
import {Stats} from '../../src/services/stats'
import {setPipelineReader} from '../../src/types/rule'
import {MAX_UINT_64, STATIC_CONDITION} from '../../src/constants'
import {InMemoryAccount} from '../../src'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Balance Rule', function () {
    let balanceRule: BalanceRule
    let stats: Stats
    let balance: InMemoryAccount
    let mockServer: Mockttp

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
          settlement: {
            url: 'http://localhost:4000',
            settleThreshold: MAX_UINT_64,
            settleTo: 0n,
          }
        }
      ],
      protocols: []
    }

    beforeEach( async function () {
      stats = new Stats()
      balance = new InMemoryAccount({minimum: peerInfo.rules[0]['minimum'], maximum: peerInfo.rules[0]['maximum']})
      balanceRule = new BalanceRule({ peerInfo, stats, balance }, { url: 'http://localhost:4000', settleTo: BigInt(0), settleThreshold: BigInt(0) })
      mockServer = await getLocal()
      mockServer.start(4000)
    })

    afterEach(async () => mockServer.stop())

    describe('instantiation', function () {
      it('creates account on the settlement engine if settlementInfo is defined', async function () {
        const mockEndpoint = await mockServer.post('/accounts').thenReply(200)

        await balanceRule.startup()

        const requests = await mockEndpoint.getSeenRequests()
        assert.equal(requests.length, 1)
        assert.deepEqual(requests[0].body.json, { id: 'harry' })
      })

      it('does not create account on the settlement engine if settlementInfo is not defined', async () => {
        const mockEndpoint = await mockServer.post('/accounts').thenReply(200)
        const noSettlementBalanceRule = balanceRule = new BalanceRule({ peerInfo, stats, balance })

        await noSettlementBalanceRule.startup()

        const requests = await mockEndpoint.getSeenRequests()
        assert.isEmpty(requests)
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
        await mockServer.post('/accounts/harry/messages').thenReply(200, Buffer.from(''))
        const mockSettlementMessage: IlpPrepare = {
          amount: '0',
          executionCondition: STATIC_CONDITION,
          expiresAt: new Date(START_DATE + 2000),
          destination: 'peer.settle',
          data: Buffer.alloc(0)
        }
        const incoming = setPipelineReader('incoming', balanceRule, async () => {throw new Error('Message should not have made it through the pipeline')})
        const response = await incoming(mockSettlementMessage)

        assert.isTrue(isFulfill(response))
      })

      it('rejects peer.settle messages if settlementInfo is not defined', async () => {
        const noSettlementBalanceRule = balanceRule = new BalanceRule({ peerInfo, stats, balance })
        const mockEndpoint = await mockServer.post('/accounts/harry/messages').thenReply(200, Buffer.from(''))
        const mockSettlementMessage: IlpPrepare = {
          amount: '0',
          executionCondition: STATIC_CONDITION,
          expiresAt: new Date(START_DATE + 2000),
          destination: 'peer.settle',
          data: Buffer.alloc(0)
        }

        const incoming = setPipelineReader('incoming', noSettlementBalanceRule, async () => {throw new Error('Message should not have made it through the pipeline')})
        const response = await incoming(mockSettlementMessage)

        assert.isTrue(isReject(response))
        assert.isEmpty(await mockEndpoint.getSeenRequests())
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

    describe('shutdown', function () {
      it('removes account on the settlement engine', async function () {
        const mockEndpoint = await mockServer.delete('/accounts/harry').thenReply(200)

        await balanceRule.shutdown()

        const requests = await mockEndpoint.getSeenRequests()
        assert.equal(requests[0].path, '/accounts/harry')
      })

      it('does not remove account on settlement engine if settlementInfo is not defined', async () => {
        const mockEndpoint = await mockServer.delete('/accounts/harry').thenReply(200)
        const noSettlementBalanceRule = balanceRule = new BalanceRule({ peerInfo, stats, balance })

        await noSettlementBalanceRule.shutdown()

        assert.isEmpty(await mockEndpoint.getSeenRequests())
      })
    })

})
