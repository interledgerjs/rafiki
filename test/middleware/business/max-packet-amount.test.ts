import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpFulfill, isFulfill, Errors } from 'ilp-packet';
import { MaxPacketAmountMiddleware } from '../../../src/middleware/business/max-packet-amount'
import { setPipelineHandler } from '../../../src/types/middleware';
const { AmountTooLargeError } = Errors

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Max Packet Amount Middleware', function () {
    let maxPacketAmountMiddleware: MaxPacketAmountMiddleware

    beforeEach( async function () {
      maxPacketAmountMiddleware = new MaxPacketAmountMiddleware({maxPacketAmount: '100'})
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

      setPipelineHandler('incoming', maxPacketAmountMiddleware, async () => fulfillPacket)
      let reply = await maxPacketAmountMiddleware.incoming.request(preparePacket)
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

      setPipelineHandler('incoming', maxPacketAmountMiddleware, async () => fulfillPacket)
      try {
        await maxPacketAmountMiddleware.incoming.request(preparePacket)
      } catch (err) { 
        return; 
      }
      throw new Error('Should have thrown an error');
    })
})