import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { Pipelines } from '../../../src/types/middleware'
import { IlpPrepare, IlpFulfill, isFulfill, Errors } from 'ilp-packet';
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import ThroughputMiddleware from '../../../src/middleware/business/throughput'
import Stats from '../../../src/services/stats';
import { PeerInfo } from '../../../src/types/peer';
const { InsufficientLiquidityError } = Errors

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Throughput Middleware', function () {
  let pipelines: Pipelines
  let stats: Stats
  let throughputMiddleware: ThroughputMiddleware
  let peerInfo: PeerInfo = {
    id: 'harry',
    relation: 'peer',
    assetScale: 9,
    assetCode: 'XRP',
    throughput: { refillPeriod: 100, incomingAmount: '100', outgoingAmount: '100' }
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

  describe('incoming', function () {

    beforeEach(async function () {
      peerInfo = {
        id: 'harry',
        relation: 'peer',
        assetScale: 9,
        assetCode: 'XRP',
        throughput: { refillPeriod: 100, incomingAmount: '100' }
      }
      throughputMiddleware = new ThroughputMiddleware({ peerInfo })
      pipelines = await constructPipelines({ 'throughput': throughputMiddleware })
    })

    it('adds methods to the correct pipeline', async function () {
      assert.isNotEmpty(pipelines.incomingData.getMethods())
      assert.equal(pipelines.incomingData.getMethods().length, 1)
      assert.isEmpty(pipelines.outgoingData.getMethods())
      assert.isEmpty(pipelines.startup.getMethods())
      assert.isEmpty(pipelines.shutdown.getMethods())
    })

    it('doest not allow throughput above threshold throughput through', async function () {
      let endHandler = async (data: IlpPrepare) => {
        return Promise.resolve(fulfillPacket)
      }
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)

      // Empty the token buffer
      for (let i = 0; i < 2; i++) {
        await handler(preparePacket)
      }

      try {
        const reply = await handler(preparePacket)
      } catch (err) {
        if (err instanceof InsufficientLiquidityError) {
          return
        }
      }
      throw new Error("Correct error not thrown")
    })

    it('allows throughput again after refill period', async function () {
      let endHandler = async (data: IlpPrepare) => {
        return Promise.resolve(fulfillPacket)
      }
      let handler = constructMiddlewarePipeline(pipelines.outgoingData, endHandler)

      // Empty the token buffer
      for (let i = 0; i < 2; i++) {
        await handler(preparePacket)
      }

      try {
        const reply = await handler(preparePacket)
        throw new Error("Should have thrown error")
      } catch (err) {
        if (err instanceof InsufficientLiquidityError) {
          
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      const reply = await handler(preparePacket)
      assert.isTrue(isFulfill(reply))
    })


  })

  describe('outgoing', function () {
    beforeEach(async function () {
      peerInfo = {
        id: 'harry',
        relation: 'peer',
        assetScale: 9,
        assetCode: 'XRP',
        throughput: { refillPeriod: 100, outgoingAmount: '100' }
      }
      throughputMiddleware = new ThroughputMiddleware({ peerInfo })
      pipelines = await constructPipelines({ 'throughput': throughputMiddleware })
    })

    it('adds methods to the correct pipeline', async function () {
      assert.isEmpty(pipelines.incomingData.getMethods())
      assert.isNotEmpty(pipelines.outgoingData.getMethods())
      assert.equal(pipelines.outgoingData.getMethods().length, 1)
      assert.isEmpty(pipelines.startup.getMethods())
      assert.isEmpty(pipelines.shutdown.getMethods())
    })

    it('doest not allow throughput above threshold throughput through', async function () {
      let endHandler = async (data: IlpPrepare) => {
        return Promise.resolve(fulfillPacket)
      }
      let handler = constructMiddlewarePipeline(pipelines.outgoingData, endHandler)

      // Empty the token buffer
      for (let i = 0; i < 2; i++) {
        await handler(preparePacket)
      }

      try {
        const reply = await handler(preparePacket)
      } catch (err) {
        if (err instanceof InsufficientLiquidityError) {
          return
        }
      }
      throw new Error("Correct error not thrown")
    })

    it('allows throughput again after refill period', async function () {
      let endHandler = async (data: IlpPrepare) => {
        return Promise.resolve(fulfillPacket)
      }
      let handler = constructMiddlewarePipeline(pipelines.outgoingData, endHandler)

      // Empty the token buffer
      for (let i = 0; i < 2; i++) {
        await handler(preparePacket)
      }

      try {
        const reply = await handler(preparePacket)
        throw new Error("Should have thrown error")
      } catch (err) {
        if (err instanceof InsufficientLiquidityError) {
          
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      const reply = await handler(preparePacket)
      assert.isTrue(isFulfill(reply))
    })
  })

  describe('none', function () {

    beforeEach(async function () {
      peerInfo = {
        id: 'harry',
        relation: 'peer',
        assetScale: 9,
        assetCode: 'XRP',
        throughput: { refillPeriod: 100 }
      }
      throughputMiddleware = new ThroughputMiddleware({ peerInfo })
      pipelines = await constructPipelines({ 'throughput': throughputMiddleware })
    })

    it('does not add any methods to the pipelines', async function () {
      assert.isEmpty(pipelines.incomingData.getMethods())
      assert.isEmpty(pipelines.outgoingData.getMethods())
      assert.isEmpty(pipelines.startup.getMethods())
      assert.isEmpty(pipelines.shutdown.getMethods())
    })
  })
  
})