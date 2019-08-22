// import 'mocha'
// import * as sinon from 'sinon'
// import * as Chai from 'chai'
// import chaiAsPromised from 'chai-as-promised'
// import {ValidateFulfillmentRule} from '../../src/rules'
// import {setPipelineReader} from '../../rafiki-core/src/types'

// Chai.use(chaiAsPromised)
// const assert = Object.assign(Chai.assert, sinon.assert)
// const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

// describe('Validate fulfillment Middlware', function () {

//   let validateFulfillmentRule: ValidateFulfillmentRule

//   const preparePacket = {
//     amount: '52',
//     executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
//     expiresAt: new Date(START_DATE + 2000),
//     destination: 'mock.test3.bob',
//     data: Buffer.alloc(0)
//   }

//   beforeEach(async function () {
//     validateFulfillmentRule = new ValidateFulfillmentRule()
//   })

//   it('throws wrong condition error if fulfill has incorrect condition', async function () {
//     const fulfillPacket = {
//       fulfillment: Buffer.from('ILPHaxsILPHaxsILPHaxsILPHILPHaxs'),
//       data: Buffer.alloc(0)
//     }
//     const sendOutgoing = setPipelineReader('outgoing', validateFulfillmentRule, async () => fulfillPacket)
//     try{
//       await sendOutgoing(preparePacket)
//     } catch (e) {
//       return
//     }
//     assert.fail()
//   })

//   it('returns fulfill response that has correct fulfillment condition', async function () {
//     const fulfillPacket = {
//       fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
//       data: Buffer.alloc(0)
//     }
//     const sendOutgoing = setPipelineReader('outgoing', validateFulfillmentRule, async () => fulfillPacket)
//     const reply = await sendOutgoing(preparePacket)
//     assert.strictEqual(reply, fulfillPacket)
//   })

//   it('returns reject responses', async function () {
//     const rejectPacket = {
//       code: 'T04',
//       triggeredBy: 'mock.test1',
//       message: 'exceeded maximum balance.',
//       data: Buffer.alloc(0)
//     }
//     const sendOutgoing = setPipelineReader('outgoing', validateFulfillmentRule, async () => rejectPacket)
//     const reply = await sendOutgoing(preparePacket)

//     assert.strictEqual(reply, rejectPacket)
//   })
// })
