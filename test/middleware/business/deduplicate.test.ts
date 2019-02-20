import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { DeduplicateMiddleware, CachedPacket, PacketCache } from '../../../src/middleware/business/deduplicate'
import { IlpPrepare } from 'ilp-packet';
import { setPipelineReader } from '../../../src/types/middleware';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Deduplicate Middleware', function () {

  let deduplicateMiddleware: DeduplicateMiddleware
  let cache: PacketCache
  const cleanupInterval: number = 30000
  const packetLifetime:number = 30000
  const preparePacket: IlpPrepare = {
    amount: '100',
    executionCondition: Buffer.alloc(32),
    expiresAt: new Date(),
    destination: 'test.connie.alice',
    data: Buffer.alloc(0)
  }

  it('sets cleanup up cache to run at specified interval in the startup handler', async function () {
    this.clock = sinon.useFakeTimers()
    cache = new PacketCache({
      cleanupInterval,
      packetLifetime,
    })
    const cleanupCacheSpy = sinon.spy(cache, <any>'cleanupCache')
    this.clock.tick(cleanupInterval)
    sinon.assert.calledOnce(cleanupCacheSpy)
    this.clock.restore()
  })

  it('clears the cleanup interval in the shutdown pipeline', async function () {
    this.clock = sinon.useFakeTimers()
    cache = new PacketCache({
      cleanupInterval,
      packetLifetime,
    })
    const cleanupCacheSpy = sinon.spy(cache, <any>'cleanupCache')
    cache.dispose()
    this.clock.tick(cleanupInterval)
    sinon.assert.notCalled(cleanupCacheSpy)
    this.clock.restore()
  })

  it('adds outgoing packets into duplicate cache', async function () {
    const preparePacket = {
      amount: '49',
      executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
      expiresAt: new Date(START_DATE + 2000),
      destination: 'mock.test1',
      data: Buffer.alloc(0)
    }
    const fulfillPacket = {
      fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
      data: Buffer.alloc(0)
    }
    cache = new PacketCache({
      cleanupInterval,
      packetLifetime,
    })
    deduplicateMiddleware = new DeduplicateMiddleware({ cache })
    const sendOutgoing = setPipelineReader('outgoing', deduplicateMiddleware, async () => fulfillPacket)
    assert.strictEqual(cache['_packetCache'].size, 0)
    await sendOutgoing(preparePacket)
    assert.strictEqual(cache['_packetCache'].size, 1)
  })

  it('duplicate packets response is served from packetCache', async function () {
    const preparePacket = {
      amount: '49',
      executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
      expiresAt: new Date(START_DATE + 2000),
      destination: 'mock.test1',
      data: Buffer.alloc(0)
    }
    const fulfillPacket = {
      fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
      data: Buffer.alloc(0)
    }
    cache = new PacketCache({
      cleanupInterval,
      packetLifetime,
    })
    deduplicateMiddleware = new DeduplicateMiddleware({ cache })

    let didNextGetCalled = false
    const sendOutgoing = setPipelineReader('outgoing', deduplicateMiddleware, async () => {
      didNextGetCalled = true
      return fulfillPacket 
    })
    assert.strictEqual(cache['_packetCache'].size, 0)
    cache.set('wLGdgkJP9a+6RG/9ZfPM7A==',
    {
      amount: '49',
      expiresAt: new Date(START_DATE + 2000),
      promise: Promise.resolve(fulfillPacket)
    })

    const reply = await sendOutgoing(preparePacket)

    assert.strictEqual(reply, fulfillPacket)
    assert.notOk(didNextGetCalled)
  })

})