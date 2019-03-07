import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpFulfill, isFulfill, Errors } from 'ilp-packet';
import { ThroughputRule, createThroughputLimitBucketsForPeer } from '../../src/rules/throughput'
import { setPipelineReader } from '../../src/types/rule';
const { InsufficientLiquidityError } = Errors

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Throughput Rule', function () {
  let throughputRule: ThroughputRule
  const preparePacket: IlpPrepare = {
    amount: '49',
    executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
    expiresAt: new Date(START_DATE + 2000),
    destination: 'mock.test1.bob',
    data: Buffer.alloc(0)
  }
  const fulfillPacket: IlpFulfill = {
    fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
    data: Buffer.alloc(0)
  }

  describe('incoming', function () {

    beforeEach(async function () {
      const buckets = createThroughputLimitBucketsForPeer({
        id: 'harry',
        relation: 'peer',
        assetScale: 9,
        assetCode: 'XRP',
        rules: [
          {
            name: 'throughput',
            refillPeriod: 100, 
            incomingAmount: 100n
          }
        ],
        protocols: []
      })
      throughputRule = new ThroughputRule(buckets)
    })

    it('doesn\'t allow throughput above threshold through', async function () {
      const sendIncoming = setPipelineReader('incoming', throughputRule, async () => fulfillPacket)
  
      // Empty the token buffer
      for (let i = 0; i < 2; i++) {
        await sendIncoming(preparePacket)
      }

      try {
        await sendIncoming(preparePacket)
      } catch (err) {
        assert.instanceOf(err, InsufficientLiquidityError)
        return
      }
      assert.fail("Should have thrown an InsufficientLiquidityError")
    })

    it('allows throughput again after refill period', async function () {
      const sendIncoming = setPipelineReader('incoming', throughputRule, async () => fulfillPacket)

      // Empty the token buffer
      for (let i = 0; i < 2; i++) {
        await sendIncoming(preparePacket)
      }

      try {
        await sendIncoming(preparePacket)
        throw new Error("Should have thrown error")
      } catch (err) {
        assert.instanceOf(err, InsufficientLiquidityError)
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      const reply = await sendIncoming(preparePacket)
      assert.isTrue(isFulfill(reply))
    })


  })

  describe('outgoing', function () {
    beforeEach(async function () {
      const buckets = createThroughputLimitBucketsForPeer({
        id: 'harry',
        relation: 'peer',
        assetScale: 9,
        assetCode: 'XRP',
        rules: [
          {
            name: 'throughput',
            refillPeriod: 100, 
            outgoingAmount: 100n
          }
        ],
        protocols: []
      })
      throughputRule = new ThroughputRule(buckets)
    })

    it('doesn\'t allow throughput above threshold throughput through', async function () {
      const sendOutgoing = setPipelineReader('outgoing', throughputRule, async () => fulfillPacket)

      // Empty the token buffer
      for (let i = 0; i < 2; i++) {
        await sendOutgoing(preparePacket)
      }

      try {
        await sendOutgoing(preparePacket)
      } catch (err) {
        assert.instanceOf(err, InsufficientLiquidityError)
        return
      }
      assert.fail("Should have thrown an InsufficientLiquidityError")
    })

    it('allows throughput again after refill period', async function () {
      const sendOutgoing = setPipelineReader('outgoing', throughputRule, async () => fulfillPacket)

      // Empty the token buffer
      for (let i = 0; i < 2; i++) {
        await sendOutgoing(preparePacket)
      }

      try {
        await sendOutgoing(preparePacket)
        throw new Error("Should have thrown error")
      } catch (err) {
        assert.instanceOf(err, InsufficientLiquidityError)
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      const reply = await sendOutgoing(preparePacket)
      assert.isTrue(isFulfill(reply))
    })
  })

  describe('none', function () {

    beforeEach(async function () {
      const buckets = createThroughputLimitBucketsForPeer({
        id: 'harry',
        relation: 'peer',
        assetScale: 9,
        assetCode: 'XRP',
        rules: [
          {
            name: 'throughput'
          }
        ],
        protocols: []
      })
      throughputRule = new ThroughputRule(buckets)
    })

    it('does not apply any limits', async function () {
      const sendOutgoing = setPipelineReader('outgoing', throughputRule, async () => fulfillPacket)
      for (let i = 0; i < 100; i++) {
        await sendOutgoing(preparePacket)
      }
      const sendIncoming = setPipelineReader('incoming', throughputRule, async () => fulfillPacket)
      for (let i = 0; i < 100; i++) {
        await sendIncoming(preparePacket)
      }
    })
  })
  
})