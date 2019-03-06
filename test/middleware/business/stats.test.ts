import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { StatsMiddleware } from '../../../src/middleware/business/stats'
import { IlpPrepare, IlpReply } from 'ilp-packet';
import Stats from '../../../src/services/stats';
import { setPipelineReader } from '../../../src/types/middleware';
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Stats Middleware', function () {

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
        id: 'alice',
        relation: 'peer',
        assetScale: 2,
        assetCode: 'TEST',
        rules: [],
        protocols: []
      },
      stats
    })
  })

  it('increments stats incomingDataPackets fulfilled when receiving a fulfill', async function () {
    const sendIncoming = setPipelineReader('incoming', statsMiddleware, async () => fulfillPacket)
    const reply = await sendIncoming(preparePacket)

    assert.strictEqual(stats.getStatus()[0]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[0]['values'][0].labels.result, 'fulfilled')
    assert.strictEqual(reply, fulfillPacket)
  })

  it('increments stats outgoingDataPackets fulfilled when receiving a fulfill', async function () {
    const sendOutgoing = setPipelineReader('outgoing', statsMiddleware, async () => fulfillPacket)
    const reply = await sendOutgoing(preparePacket)

    assert.strictEqual(stats.getStatus()[2]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[2]['values'][0].labels.result, 'fulfilled')
    assert.strictEqual(reply, fulfillPacket)
  })

  it('increments stats incomingDataPackets rejected when receiving a reject', async function () {
    const sendIncoming = setPipelineReader('incoming', statsMiddleware, async () => rejectPacket)
    const reply = await sendIncoming(preparePacket)

    assert.strictEqual(stats.getStatus()[0]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[0]['values'][0].labels.result, 'rejected')
    assert.strictEqual(reply, rejectPacket)
  })

  it('increments stats outgoingDataPackets rejected when receiving a reject', async function () {
    const sendOutgoing = setPipelineReader('outgoing', statsMiddleware, async () => rejectPacket)
    const reply = await sendOutgoing(preparePacket)

    assert.strictEqual(stats.getStatus()[2]['values'].length, 1)
    assert.strictEqual(stats.getStatus()[2]['values'][0].labels.result, 'rejected')
    assert.strictEqual(reply, rejectPacket)
  })

  it('increments stats incomingDataPackets failed when a response fails or error is thrown', async function () {
    const sendIncoming = setPipelineReader('incoming', statsMiddleware, async () => {
      throw new Error('test error')
      return rejectPacket
    })
    try{
      const reply = await sendIncoming(preparePacket)
    } catch (e) {
      assert.strictEqual(stats.getStatus()[0]['values'].length, 1)
      assert.strictEqual(stats.getStatus()[0]['values'][0].labels.result, 'failed')
    }    
  })

  it('increments stats outgoingDataPackets failed when receiving a reject', async function () {
    const sendOutgoing = setPipelineReader('outgoing', statsMiddleware, async () => {
      throw new Error('test error')
      return rejectPacket
    })
    try{
      const reply = await sendOutgoing(preparePacket)
    } catch (e) {
      assert.strictEqual(stats.getStatus()[2]['values'].length, 1)
      assert.strictEqual(stats.getStatus()[2]['values'][0].labels.result, 'failed')
    }
  })

})