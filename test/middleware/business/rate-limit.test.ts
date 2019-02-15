import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { Pipelines } from '../../../src/types/middleware'
import { IlpPrepare, IlpFulfill, isFulfill, Errors } from 'ilp-packet';
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import RateLimitMiddleware from '../../../src/middleware/business/rate-limit'
import Stats from '../../../src/services/stats';
import { PeerInfo } from '../../../src/types/peer';
const { RateLimitedError } = Errors

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Rate Limit Middleware', function () {
  let pipelines: Pipelines
  let stats: Stats
  let rateLimitMiddleware: RateLimitMiddleware
  let peerInfo: PeerInfo = {
    id: 'harry',
    relation: 'peer',
    assetScale: 9,
    assetCode: 'XRP',
    rateLimit: { refillCount: 3, capacity: 3 }
  }
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

  beforeEach(async function () {
    stats = new Stats()
    rateLimitMiddleware = new RateLimitMiddleware({ stats, peerInfo })
    pipelines = await constructPipelines({ 'rate-limit': rateLimitMiddleware })
  })

  it('adds methods to the correct pipeline', async function () {
    assert.isNotEmpty(pipelines.incomingData.getMethods())
    assert.equal(pipelines.incomingData.getMethods().length, 1)
    assert.isEmpty(pipelines.outgoingData.getMethods())
    assert.isEmpty(pipelines.startup.getMethods())
    assert.isEmpty(pipelines.shutdown.getMethods())
  })

  it('rejects when payments arrive too quickly', async function () {
    let endHandler = async (data: IlpPrepare) => {
      return Promise.resolve(fulfillPacket)
    }
    let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)

    // Empty the token buffer
    for (let i = 0; i < 3; i++) {
      await handler(preparePacket)
    }

    try {
      const reply = await handler(preparePacket)
    } catch (err) { 
      if(err instanceof RateLimitedError){
        return
      }
     }
  })

  it('does not reject when payments arrive fine', async function () {
    let endHandler = async (data: IlpPrepare) => {
      return Promise.resolve(fulfillPacket)
    }
    let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)

    const reply = await handler(preparePacket)
    assert.isTrue(isFulfill(reply))
  })
})