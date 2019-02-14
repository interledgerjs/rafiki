import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import StatsMiddleware from '../../../src/middleware/business/stats'
import { IlpPrepare, IlpPacketHander, IlpReply } from 'ilp-packet';
import { Pipelines } from '../../../src/types/middleware';
import Stats from '../../../src/services/stats';
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Stats Middleware', function () {

  let pipelines: Pipelines
  let statsMiddleware: StatsMiddleware
  let stats: Stats
  
  const preparePacket: IlpPrepare = {
    amount: '49',
    executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
    expiresAt: new Date(START_DATE + 2000),
    destination: 'mock.test3.bob',
    data: Buffer.alloc(0)
  }

  const fulfillPacket = {
    fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
    data: Buffer.alloc(0)
  }

    const rejectPacket = {
      code: 'T04',
      triggeredBy: 'mock.test1',
      message: 'exceeded maximum balance.',
      data: Buffer.alloc(0)
    }

  beforeEach(async function () {
    stats = new Stats()
    statsMiddleware = new StatsMiddleware({
      peerInfo: {
        'id': 'alice',
        'relation': 'peer',
        'assetScale': 2,
        'assetCode': 'TEST'
      },
      stats
    })
    const middleware = {
      'stats': statsMiddleware
    }
    pipelines = await constructPipelines(middleware)
  })

  it('inserts itself into the incoming and outgoing money and data pipelines', async function () {
    assert.equal(pipelines.incomingData.getMethods().length, 1)
    assert.equal(pipelines.incomingMoney.getMethods().length, 1)
    assert.equal(pipelines.incomingMoney.getMethods().length, 1)
    assert.equal(pipelines.outgoingMoney.getMethods().length, 1)
    assert.isEmpty(pipelines.startup.getMethods())
    assert.isEmpty(pipelines.shutdown.getMethods())
  })

  it('increments stats incomingDataPackets fulfilled when receiving a fulfill', async function () {
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, async (packet: IlpPrepare) => fulfillPacket)

    const reply = await incomingIlpPacketHandler(preparePacket)

    assert.strictEqual(stats.getStatus()[0]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[0]['values'][0].labels.result, 'fulfilled')
    assert.strictEqual(reply, fulfillPacket)
  })

  it('increments stats outgoingDataPackets fulfilled when receiving a fulfill', async function () {
    const outgoingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, async (packet: IlpPrepare) => fulfillPacket)

    const reply = await outgoingIlpPacketHandler(preparePacket)

    assert.strictEqual(stats.getStatus()[2]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[2]['values'][0].labels.result, 'fulfilled')
    assert.strictEqual(reply, fulfillPacket)
  })

  it('increments stats incomingDataPackets rejected when receiving a reject', async function () {
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, async (packet: IlpPrepare) => rejectPacket)

    const reply = await incomingIlpPacketHandler(preparePacket)

    assert.strictEqual(stats.getStatus()[0]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[0]['values'][0].labels.result, 'rejected')
    assert.strictEqual(reply, rejectPacket)
  })

  it('increments stats outgoingDataPackets rejected when receiving a reject', async function () {
    const outgoingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, async (packet: IlpPrepare) => rejectPacket)

    const reply = await outgoingIlpPacketHandler(preparePacket)

    assert.strictEqual(stats.getStatus()[2]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[2]['values'][0].labels.result, 'rejected')
    assert.strictEqual(reply, rejectPacket)
  })

  it('increments stats incomingDataPackets failed when a response fails or error is thrown', async function () {
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, async (packet: IlpPrepare) => {
      throw new Error('test error')
      return rejectPacket
    })
    let reply: IlpReply

    try{
      reply = await incomingIlpPacketHandler(preparePacket)
    } catch (e) {
      assert.strictEqual(stats.getStatus()[0]['values'].length, 1)
      assert.strictEqual(stats.getStatus()[0]['values'][0].labels.result, 'failed')
    }    
  })

  it('increments stats outgoingDataPackets failed when receiving a reject', async function () {
    const outgoingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, async (packet: IlpPrepare) => {
      throw new Error('test error')
      return rejectPacket
    })
    let reply: IlpReply

    try{
      reply = await outgoingIlpPacketHandler(preparePacket)
    } catch (e) {
      assert.strictEqual(stats.getStatus()[2]['values'].length, 1)
      assert.strictEqual(stats.getStatus()[2]['values'][0].labels.result, 'failed')
    }
  })

  it('increments stats incomingMoney succeeded on incoming money pipeline', async function () {
    const incomingMoneyHandler = constructMiddlewarePipeline(pipelines.incomingMoney, async () => {})

    await incomingMoneyHandler('100')

    assert.strictEqual(stats.getStatus()[4]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[4]['values'][0].labels.result, 'succeeded')
    assert.strictEqual(stats.getStatus()[4]['values'][0].labels.account, 'alice')
    assert.strictEqual(stats.getStatus()[4]['values'][0].labels.asset, 'TEST')
    assert.strictEqual(stats.getStatus()[4]['values'][0].labels.scale, 2)
  })

  it('increments stats incomingMoney failed on incoming money pipeline if response fails', async function () {
    const incomingMoneyHandler = constructMiddlewarePipeline(pipelines.incomingMoney, async () => { throw new Error('test error') })

    try{
      await incomingMoneyHandler('100')
    } catch (e) {
      assert.strictEqual(stats.getStatus()[4]['values'].length, 1)
      assert.strictEqual(stats.getStatus()[4]['values'][0].labels.result, 'failed')
      assert.strictEqual(stats.getStatus()[4]['values'][0].labels.account, 'alice')
      assert.strictEqual(stats.getStatus()[4]['values'][0].labels.asset, 'TEST')
      assert.strictEqual(stats.getStatus()[4]['values'][0].labels.scale, 2)
    }
  })

  it('increments stats outgoingMoney succeeded on outgoingcoming money pipeline', async function () {
    const outgoingMoneyHandler = constructMiddlewarePipeline(pipelines.outgoingMoney, async () => {})

    await outgoingMoneyHandler('100')

    assert.strictEqual(stats.getStatus()[5]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[5]['values'][0].labels.result, 'succeeded')
    assert.strictEqual(stats.getStatus()[5]['values'][0].labels.account, 'alice')
    assert.strictEqual(stats.getStatus()[5]['values'][0].labels.asset, 'TEST')
    assert.strictEqual(stats.getStatus()[5]['values'][0].labels.scale, 2)
  })

  it('increments stats outgoingMoney failed on outgoing money pipeline if response fails', async function () {
    const outgoingMoneyHandler = constructMiddlewarePipeline(pipelines.outgoingMoney, async () => { throw new Error('test error') })

    try{
      await outgoingMoneyHandler('100')
    } catch (e) {
      assert.strictEqual(stats.getStatus()[5]['values'].length, 1)
      assert.strictEqual(stats.getStatus()[5]['values'][0].labels.result, 'failed')
      assert.strictEqual(stats.getStatus()[5]['values'][0].labels.account, 'alice')
      assert.strictEqual(stats.getStatus()[5]['values'][0].labels.asset, 'TEST')
      assert.strictEqual(stats.getStatus()[5]['values'][0].labels.scale, 2)
    }
  })

})