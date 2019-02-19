import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, isReject, IlpFulfill, isFulfill, IlpReject } from 'ilp-packet';
import { ErrorHandlerMiddleware } from '../../../src/middleware/business/error-handler'
import { RateLimitedError } from 'ilp-packet/dist/src/errors';
import { setPipelineHandler } from '../../../src/types/middleware';

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Error-handler Middleware', function () {
    let errorHandlerMiddleware: ErrorHandlerMiddleware
    const getOwnIlpAddress = () => 'g.own.address'

    beforeEach( async function () {
      errorHandlerMiddleware = new ErrorHandlerMiddleware({getOwnIlpAddress})
    })

    it('converts ilp packet errors thrown in pipeline to IlpRejects', async function() {
      const preparePacket: IlpPrepare = {
        amount: '49',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(START_DATE + 2000),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      setPipelineHandler('incoming', errorHandlerMiddleware, async () => {
        throw new RateLimitedError('to many requests, throttling')
      })
      const reply = await errorHandlerMiddleware.incoming.request(preparePacket)
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

      setPipelineHandler('incoming', errorHandlerMiddleware, async () => {
        return Promise.resolve(fulfillPacket)
      })
      const reply = await errorHandlerMiddleware.incoming.request(preparePacket)
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

      setPipelineHandler('incoming', errorHandlerMiddleware, async () => {
        return Promise.resolve(rejectPacket)
      })

      const reply = await errorHandlerMiddleware.incoming.request(preparePacket)
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

      setPipelineHandler('incoming', errorHandlerMiddleware, async () => {
        return Promise.resolve({} as IlpFulfill)
      })

      const reply = await errorHandlerMiddleware.incoming.request(preparePacket)
      assert.isTrue(isReject(reply))
      assert.deepEqual(reply, {
            code: "F00",
            data: Buffer.from(''),
            message: "handler did not return a value.",
            triggeredBy: "g.own.address"
         })
    })

})