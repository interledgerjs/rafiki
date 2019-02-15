import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import ValidateFulfillmentMiddleware from '../../../src/middleware/business/validate-fulfillment'
import { IlpPrepare, IlpFulfill, serializeIlpFulfill } from 'ilp-packet'
import { Pipelines } from '../../../src/types/middleware'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Validate fulfillment Middlware', function () {

  let pipelines: Pipelines
  let validateFulfillmentMiddleware: ValidateFulfillmentMiddleware

  const preparePacket = {
    amount: '52',
    executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
    expiresAt: new Date(START_DATE + 2000),
    destination: 'mock.test3.bob',
    data: Buffer.alloc(0)
  }

  beforeEach(async function () {
    validateFulfillmentMiddleware = new ValidateFulfillmentMiddleware()
    const middleware = {
      'ildcp': validateFulfillmentMiddleware
    }
    pipelines = await constructPipelines(middleware)
  })

  it('inserts itself into the outgoing data pipeline', async function () {
    assert.equal(pipelines.outgoingData.getMethods().length, 1)
    assert.isEmpty(pipelines.incomingData.getMethods())
    assert.isEmpty(pipelines.incomingMoney.getMethods())
    assert.isEmpty(pipelines.outgoingMoney.getMethods())
    assert.isEmpty(pipelines.startup.getMethods())
    assert.isEmpty(pipelines.shutdown.getMethods())
  })

  it('throws wrong condition error if fulfill has incorrect condition', async function () {
    const fulfillPacket = {
      fulfillment: Buffer.from('ILPHaxsILPHaxsILPHaxsILPHILPHaxs'),
      data: Buffer.alloc(0)
    }
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, async (packet: IlpPrepare) => fulfillPacket)

    try{
      await incomingIlpPacketHandler(preparePacket)
    } catch (e) {
      return
    }
    assert.fail()
  })

  it('returns fulfill response that has correct fulfillment condition', async function () {
    const fulfillPacket = {
      fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
      data: Buffer.alloc(0)
    }
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, async (packet: IlpPrepare) => fulfillPacket)

    const reply = await incomingIlpPacketHandler(preparePacket)

    assert.strictEqual(reply, fulfillPacket)
  })

  it('returns reject responses', async function () {
    const rejectPacket = {
      code: 'T04',
      triggeredBy: 'mock.test1',
      message: 'exceeded maximum balance.',
      data: Buffer.alloc(0)
    }
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.outgoingData, async (packet: IlpPrepare) => rejectPacket)

    const reply = await incomingIlpPacketHandler(preparePacket)

    assert.strictEqual(reply, rejectPacket)
  })
})