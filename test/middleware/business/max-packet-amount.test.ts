import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import {Pipelines} from '../../../src/types/middleware'
import { IlpPrepare, IlpFulfill, isFulfill, Errors } from 'ilp-packet';
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import MaxPacketAmountMiddleware from '../../../src/middleware/business/max-packet-amount'
const { AmountTooLargeError } = Errors

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Max Packet Amount Middleware', function () {
    let pipelines: Pipelines
    let maxPacketAmountMiddleware: MaxPacketAmountMiddleware

    beforeEach( async function () {
      maxPacketAmountMiddleware = new MaxPacketAmountMiddleware({maxPacketAmount: '100', peerId: 'harry'})
      pipelines = await constructPipelines({'max-packet-amount' : maxPacketAmountMiddleware})
    })

    it('adds methods to the correct pipeline', async function() {
      assert.isNotEmpty(pipelines.incomingData.getMethods())
      assert.equal(pipelines.incomingData.getMethods().length, 1)
      assert.isEmpty(pipelines.outgoingData.getMethods())
      assert.isEmpty(pipelines.startup.getMethods())
      assert.isEmpty(pipelines.shutdown.getMethods())
    })

    it('forwards packet below max packet amount', async function() {
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
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)
      let reply = await handler(preparePacket)
      assert.isTrue(isFulfill(reply))
      assert.deepEqual(reply, fulfillPacket)
    })

    it('throws error if packet above max packet amount', async function() {
      const preparePacket: IlpPrepare = {
        amount: '200',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(Date.now() + 10),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      const fulfillPacket: IlpFulfill = {
        fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
        data: Buffer.alloc(0)
      }

      let endHandler = async (data: IlpPrepare) => Promise.resolve(fulfillPacket)
      let handler = constructMiddlewarePipeline(pipelines.incomingData, endHandler)
      try {
        const reply = await handler(preparePacket)
      } catch (err) { return; }
      throw new Error('Should have thrown an error');
    })
})