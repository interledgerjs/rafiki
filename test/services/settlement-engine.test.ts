import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import SettlementEngine from '../../src/services/settlement-engine'
import { Redis } from 'ioredis'
const RedisMock = require('ioredis-mock')

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

const streamKey ='balance'
import { MAX_UINT_64 } from '../../src/constants'

describe("Settlement Engine", function () {
  let redis: Redis
  let settlementEngine: SettlementEngine

  beforeEach(function () {
    redis = new RedisMock()
    settlementEngine = new SettlementEngine({ redisClient: redis, streamKey: streamKey })
  })

  afterEach(async function () {
    await settlementEngine.shutdown()
  })

  describe("setBalance", function () {
    it("can set balance for peer if engine hasn't been started", async function () {
      settlementEngine.setBalance('bob', 1000n)
  
      assert.equal(settlementEngine.getBalance('bob'), 1000n)
    })

    it('sets limits if specified', async function () {
      settlementEngine.setBalance('bob', 1000n, 1n, 10n)

      const limits = settlementEngine.getBalanceLimits('bob')

      assert.deepEqual(limits!.min, 1n)
      assert.deepEqual(limits!.max, 10n)
    })

    it('sets limits to default if not specified', async function () {
      settlementEngine.setBalance('bob', 1000n)

      const limits = settlementEngine.getBalanceLimits('bob')

      assert.deepEqual(limits!.min, 0n)
      assert.deepEqual(limits!.max, BigInt(MAX_UINT_64))
    })
  
    it("throws error if engine has started", async function () {
      await settlementEngine.start()

      try{
        settlementEngine.setBalance('bob', 1000n)
      } catch(e) {
        assert.equal(e.message, "Can't set balance once settlement engine has started.")
        return
      }

      assert.fail("Did not throw expected error.")
    })
  })

  describe("getBalance", function () {
    it('throws error if balance is not set for peer', async function () {
      try {
        settlementEngine.getBalance('bob')
      } catch (e) {
        assert.equal(e.message, 'Balance has not been set for peerId=bob')
        return
      }

      assert.fail('Did not throw expected error')
    })
  })

  describe("updateBalance", async function () {
    it("sets redis flag to false if new balance is below the minimum balance limit and still updates balance", async function () {
      settlementEngine.setBalance('bob', 1000n, 600n, 1200n)
      await redis.set("bob:balance:enabled", true)

      await settlementEngine.updateBalance('bob', -500n)

      assert.equal(await redis.get("bob:balance:enabled"), "false")
      assert.equal(settlementEngine.getBalance('bob'), 500n)
    })

    it("sets redis flag to true if new balance comes back above minimum limit", async function () {
      settlementEngine.setBalance('bob', 500n, 600n, 1200n)
      await redis.set("bob:balance:enabled", false)

      await settlementEngine.updateBalance('bob', 150n)

      assert.equal(await redis.get("bob:balance:enabled"), "true")
      assert.equal(settlementEngine.getBalance('bob'), 650n)
    })

    it("sets redis flag to false if new balance is above the maximum balance limit", async function () {
      settlementEngine.setBalance('bob', 1000n, 600n, 1200n)
      await redis.set("bob:balance:enabled", true)

      await settlementEngine.updateBalance('bob', 300n)

      assert.equal(await redis.get("bob:balance:enabled"), "false")
      assert.equal(settlementEngine.getBalance('bob'), 1300n)
    })

    it("sets redis flag to false if new balance comes back below the maximum balance limit", async function () {
      settlementEngine.setBalance('bob', 1300n, 600n, 1200n)
      await redis.set("bob:balance:enabled", true)

      await settlementEngine.updateBalance('bob', -300n)

      assert.equal(await redis.get("bob:balance:enabled"), "true")
      assert.equal(settlementEngine.getBalance('bob'), 1000n)
    })
  })

  describe('processMessage', function () {

    it('increases peer balance for incoming prepare', async function (){
      settlementEngine.setBalance('bob', 1000n)
      await redis.xadd(streamKey, '*', 'peerId', 'bob', 'type', 'prepare', 'pipeline', 'incoming', 'amount', '500')

      await settlementEngine.process(streamKey)

      assert.deepEqual(settlementEngine.getBalance('bob'), 1500n)
    })

    it('decreases peer balance for outgoing fulfill', async function () {
      settlementEngine.setBalance('bob', 1000n)
      await redis.xadd(streamKey, '*', 'peerId', 'bob', 'type', 'fulfill', 'pipeline', 'outgoing', 'amount', '500')

      await settlementEngine.process(streamKey)

      assert.deepEqual(settlementEngine.getBalance('bob'), 500n)
    })

    it('decreases peer balance for incoming reject', async function () {
      settlementEngine.setBalance('bob', 1000n)
      await redis.xadd(streamKey, '*', 'peerId', 'bob', 'type', 'reject', 'pipeline', 'incoming', 'amount', '500')

      await settlementEngine.process(streamKey)

      assert.deepEqual(settlementEngine.getBalance('bob'), 500n)
    })

    it('decreases peer balance for incoming failure', async function () {
      settlementEngine.setBalance('bob', 1000n)
      await redis.xadd(streamKey, '*', 'peerId', 'bob', 'type', 'failed', 'pipeline', 'incoming', 'amount', '500')

      await settlementEngine.process(streamKey)

      assert.deepEqual(settlementEngine.getBalance('bob'), 500n)
    })
  })
})