import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import DeduplicateMiddleware, { CachedPacket } from '../../../src/middleware/business/deduplicate'
import { IlpPrepare } from 'ilp-packet';
import { Pipelines } from '../../../src/types/middleware';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Deduplicate Middleware', function () {

  let pipelines: Pipelines
  let deduplicateMiddleware: DeduplicateMiddleware
  let packetCache: Map<string, CachedPacket>
  const cleanupInterval: number = 30000
  const packetLifetime:number = 30000
  const preparePacket: IlpPrepare = {
    amount: '100',
    executionCondition: Buffer.alloc(32),
    expiresAt: new Date(),
    destination: 'test.connie.alice',
    data: Buffer.alloc(0)
  }

  beforeEach(async function () {
    packetCache = new Map()
    deduplicateMiddleware = new DeduplicateMiddleware({
      peerInfo: {
        'id': 'alice',
        'relation': 'peer',
        'assetScale': 2,
        'assetCode': 'TEST'
      },
      cleanupInterval,
      packetLifetime,
      packetCache
    })
    const middleware = {
      'deduplicate': deduplicateMiddleware
    }
    pipelines = await constructPipelines(middleware)
  })

  it('inserts itself into the startup, shutdown, and outgoing data pipelines', async function () {
    assert.equal(pipelines.startup.getMethods().length, 1)
    assert.equal(pipelines.shutdown.getMethods().length, 1)
    assert.equal(pipelines.outgoingData.getMethods().length, 1)
    assert.isEmpty(pipelines.incomingMoney.getMethods())
    assert.isEmpty(pipelines.outgoingMoney.getMethods())
    assert.isEmpty(pipelines.incomingData.getMethods())
  })

  it('sets cleanup up cache to run at specified interval in the startup handler', async function () {
    this.clock = sinon.useFakeTimers()
    const startupHandler = constructMiddlewarePipeline(pipelines.startup, async () => {})
    const cleanupCacheSpy = sinon.spy(deduplicateMiddleware, <any>'cleanupCache')

    await startupHandler()
    this.clock.tick(cleanupInterval)

    sinon.assert.calledOnce(cleanupCacheSpy)
    this.clock.restore()
  })

  it('clears the cleanup interval in the shutdown pipeline', async function () {
    this.clock = sinon.useFakeTimers()
    const startupHandler = constructMiddlewarePipeline(pipelines.startup, async () => {})
    const shutdownHandler = constructMiddlewarePipeline(pipelines.shutdown, async () => {})
    const cleanupCacheSpy = sinon.spy(deduplicateMiddleware, <any>'cleanupCache')

    await startupHandler()
    await shutdownHandler()
    this.clock.tick(cleanupInterval)

    sinon.assert.notCalled(cleanupCacheSpy)
    this.clock.restore()
  })

  it('Adds outgoing packets into duplicate cache', async function () {
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
    const outgoingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, async (packet: IlpPrepare) => fulfillPacket)
    assert.strictEqual(packetCache.size, 0)

    await outgoingIlpPacketHandler(preparePacket)

    assert.strictEqual(packetCache.size, 1)
  })

  it('Duplicate Packets response is served from packetCache', async function () {
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
    let didNextGetCalled = false
    const outgoingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, async (packet: IlpPrepare) =>{
      didNextGetCalled = true
      return fulfillPacket
    })
    packetCache.set('wLGdgkJP9a+6RG/9ZfPM7A==',
    {
      amount: '49',
      expiresAt: new Date(START_DATE + 2000),
      promise: Promise.resolve(fulfillPacket)
    })

    const reply = await outgoingIlpPacketHandler(preparePacket)

    assert.strictEqual(reply, fulfillPacket)
    assert.notOk(didNextGetCalled)
  })

})