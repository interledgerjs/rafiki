import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import {Pipelines} from '../../../src/types/middleware'
import { IlpPrepare, isReject, IlpFulfill, isFulfill, IlpReject } from 'ilp-packet';
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import ErrorHandlerMiddleware from '../../../src/middleware/business/error-handler'
import { PeerInfo } from '../../../src/types/peer';
import { RateLimitedError } from 'ilp-packet/dist/src/errors';

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Error-handler Middleware', function () {
    let pipelines: Pipelines
    let errorHandlerMiddleware: ErrorHandlerMiddleware

    const getOwnIlpAddress = () => 'g.own.address'

    beforeEach( async function () {
      errorHandlerMiddleware = new ErrorHandlerMiddleware({getOwnIlpAddress})
      pipelines = await constructPipelines({'error-handler' : errorHandlerMiddleware})
    })

    it('adds methods to the correct pipeline', async function() {
      assert.isNotEmpty(pipelines.incomingData.getMethods())
      assert.equal(pipelines.incomingData.getMethods().length, 1)
      assert.isEmpty(pipelines.outgoingData.getMethods())
      assert.isEmpty(pipelines.startup.getMethods())
      assert.isEmpty(pipelines.shutdown.getMethods())
    })


    it('converts ilp packet errors thrown in pipeline to IlpRejects', async function() {
      const preparePacket: IlpPrepare = {
        amount: '49',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(START_DATE + 2000),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      let endHandler = (data: IlpPrepare) => {
        throw new RateLimitedError('to many requests, throttling')
      }
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)
      const reply = await handler(preparePacket)
      assert.isTrue(isReject(reply))
      assert.deepEqual(reply, {
        code: "T05",
        data: Buffer.from(''),
        message: "to many requests, throttling",
        triggeredBy: "g.own.address"
      })
    })

    it('forwards messages when no errors are thrown through pipeline and packet is IlpFulfill', async function () {
      const preparePacket: IlpPrepare = {
        amount: '49',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(START_DATE + 2000),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      const fulfillPacket: IlpFulfill = {
        fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
        data: Buffer.alloc(0)
      }

      let endHandler = (data: IlpPrepare) => {
        return Promise.resolve(fulfillPacket)
      }
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)
      const reply = await handler(preparePacket)
      assert.isTrue(isFulfill(reply))
      assert.deepEqual(reply, fulfillPacket)
    })

    it('forwards messages when no errors are thrown through pipeline and packet is IlpReject', async function () {
      const preparePacket: IlpPrepare = {
        amount: '49',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(START_DATE + 2000),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      const rejectPacket: IlpReject = {
        code: 'T01',
        triggeredBy: '2018-01-01',
        message: 'Failed to launch',
        data: Buffer.alloc(0)
      }

      let endHandler = (data: IlpPrepare) => {
        return Promise.resolve(rejectPacket)
      }

      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)
      const reply = await handler(preparePacket)
      assert.isTrue(isReject(reply))
      assert.deepEqual(reply, rejectPacket)
    })

    it('throws error and returns ilp reject is not a valid IlpReply message', async function () {
      const preparePacket: IlpPrepare = {
        amount: '49',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(START_DATE + 2000),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      let endHandler = (data: IlpPrepare) => {
        return Promise.resolve({} as IlpFulfill)
      }

      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)
      const reply = await handler(preparePacket)
      assert.isTrue(isReject(reply))
      assert.deepEqual(reply, {
            code: "F00",
            data: Buffer.from(''),
            message: "handler did not return a value.",
            triggeredBy: "g.own.address"
         })
    })

})