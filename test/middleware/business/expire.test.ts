import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import {Pipelines} from '../../../src/types/middleware'
import { IlpPrepare, IlpFulfill, isFulfill, Errors } from 'ilp-packet';
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import ExpireMiddleware from '../../../src/middleware/business/expire'
const { TransferTimedOutError } = Errors

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

function sleep(millis: number) {
  return new Promise(resolve => setTimeout(resolve, millis));
}
describe('Expire Middleware', function () {
    let pipelines: Pipelines
    let expireMiddleware: ExpireMiddleware

    const getOwnIlpAddress = () => 'g.own.address'

    beforeEach( async function () {
      expireMiddleware = new ExpireMiddleware()
      pipelines = await constructPipelines({'expire' : expireMiddleware})
    })

    it('adds methods to the correct pipeline', async function() {
      assert.isEmpty(pipelines.incomingData.getMethods())
      assert.isNotEmpty(pipelines.outgoingData.getMethods())
      assert.equal(pipelines.outgoingData.getMethods().length, 1)
      assert.isEmpty(pipelines.startup.getMethods())
      assert.isEmpty(pipelines.shutdown.getMethods())
    })

    it('forwards packet if within expiry window', async function() {
      const preparePacket: IlpPrepare = {
        amount: '49',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(Date.now() + 100),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      const fulfillPacket: IlpFulfill = {
        fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
        data: Buffer.alloc(0)
      }

      let endHandler = async (data: IlpPrepare)  => {
        return Promise.resolve(fulfillPacket)
      }
      let handler = constructMiddlewarePipeline(pipelines.outgoingData, endHandler)
      let reply = await handler(preparePacket)
      assert.isTrue(isFulfill(reply))
      assert.deepEqual(reply, fulfillPacket)
    })

    it('throws error if out of expiry window', async function() {
      const preparePacket: IlpPrepare = {
        amount: '49',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(Date.now() + 10),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      const fulfillPacket: IlpFulfill = {
        fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
        data: Buffer.alloc(0)
      }

      let endHandler = async (data: IlpPrepare)  => {
        await sleep(600)
        return Promise.resolve(fulfillPacket)
      }
      let handler = constructMiddlewarePipeline(pipelines.outgoingData, endHandler)
      try {
        await handler(preparePacket)
      } catch (err) { 
        if(err instanceof TransferTimedOutError){
          return
        }
       }
      throw new Error('Should have thrown an error');
    })
})