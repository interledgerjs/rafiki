// import 'mocha'
// import * as sinon from 'sinon'
// import * as Chai from 'chai'
// import chaiAsPromised from 'chai-as-promised'
// import {Errors, IlpPrepare} from 'ilp-packet'
// import {setPipelineReader} from '../../src/types/rule'
// import {ReduceExpiryRule} from '../src/reduce-expiry'

// Chai.use(chaiAsPromised)
// const assert = Object.assign(Chai.assert, sinon.assert)
// const { InsufficientTimeoutError } = Errors
// const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT
// const minExpirationWindow = 1000
// const maxHoldTime = 3000

// const mockFulfill = {
//   fulfillment: Buffer.alloc(32),
//   data: Buffer.from('')
// }

// describe('Reduce Expiry Middlware ', function () {
//   let reduceExpiryRule: ReduceExpiryRule

//   beforeEach(function () {
//     this.clock = sinon.useFakeTimers(new Date(START_DATE).getTime())
//     reduceExpiryRule = new ReduceExpiryRule({ minIncomingExpirationWindow: minExpirationWindow, minOutgoingExpirationWindow: minExpirationWindow, maxHoldWindow: maxHoldTime })
//   })

//   afterEach(function () {
//     this.clock.restore()
//   })

//   it('reduces the expiry time of incoming and outgoing packets by the configured time', async function () {
//     let outgoingPacketDestinationExpiry = new Date()
//     let incomingDestinationExpiry = new Date()
//     const outgoingPipeline = setPipelineReader('outgoing', reduceExpiryRule, async (packet: IlpPrepare) => {
//       outgoingPacketDestinationExpiry = packet.expiresAt
//       return mockFulfill
//     })
//     const incomingPipeline = setPipelineReader('incoming', reduceExpiryRule, async (packet: IlpPrepare) => {
//       incomingDestinationExpiry = packet.expiresAt
//       return mockFulfill
//     })

//     await incomingPipeline({
//       amount: '50',
//       destination: 'test.connie.alice',
//       executionCondition: Buffer.alloc(32),
//       expiresAt: new Date(START_DATE + 2500),
//       data: Buffer.from('test data')
//     })
//     await outgoingPipeline({
//       amount: '50',
//       destination: 'test.connie.alice',
//       executionCondition: Buffer.alloc(32),
//       expiresAt: new Date(START_DATE + 2500),
//       data: Buffer.from('test data')
//     })

//     assert.deepEqual(outgoingPacketDestinationExpiry, new Date(START_DATE + 1500))
//     assert.deepEqual(incomingDestinationExpiry, new Date(START_DATE + 1500))
//   })

//   it('caps expiry to max hold time for incoming and outgoing packets', async function () {
//     let outgoingPacketDestinationExpiry = new Date()
//     let incomingDestinationExpiry = new Date()
//     const outgoingPipeline = setPipelineReader('outgoing', reduceExpiryRule, async (packet: IlpPrepare) => {
//       outgoingPacketDestinationExpiry = packet.expiresAt
//       return mockFulfill
//     })
//     const incomingPipeline = setPipelineReader('incoming', reduceExpiryRule, async (packet: IlpPrepare) => {
//       incomingDestinationExpiry = packet.expiresAt
//       return mockFulfill
//     })

//     await incomingPipeline({
//       amount: '50',
//       destination: 'test.connie.alice',
//       executionCondition: Buffer.alloc(32),
//       expiresAt: new Date(START_DATE + 8000),
//       data: Buffer.from('test data')
//     })
//     await outgoingPipeline({
//       amount: '50',
//       destination: 'test.connie.alice',
//       executionCondition: Buffer.alloc(32),
//       expiresAt: new Date(START_DATE + 8000),
//       data: Buffer.from('test data')
//     })

//     assert.deepEqual(outgoingPacketDestinationExpiry, new Date(START_DATE + maxHoldTime))
//     assert.deepEqual(incomingDestinationExpiry, new Date(START_DATE + maxHoldTime))
//   })

//   it('throws InsufficientTimeoutError if source has already expired for outgoing packets', async function () {
//     const outgoingPipeline = setPipelineReader('outgoing', reduceExpiryRule, async (packet: IlpPrepare) => mockFulfill)

//     try {
//       await outgoingPipeline({
//         amount: '50',
//         destination: 'test.connie.alice',
//         executionCondition: Buffer.alloc(32),
//         expiresAt: new Date(START_DATE - 1000),
//         data: Buffer.from('test data')
//       })
//     } catch (e) {
//       assert.isTrue(e instanceof InsufficientTimeoutError)
//       assert.equal(e.message, "source transfer has already expired. sourceExpiry=2015-06-15T23:59:59.000Z currentTime=2015-06-16T00:00:00.000Z")
//       return
//     }

//     assert.fail("Did not throw expected error.")
//   })

//   it('throws InsufficientTimeoutError if source has already expired for incoming packets', async function () {
//     const incomingPipeline = setPipelineReader('incoming', reduceExpiryRule, async (packet: IlpPrepare) => mockFulfill)

//     try {
//       await incomingPipeline({
//         amount: '50',
//         destination: 'test.connie.alice',
//         executionCondition: Buffer.alloc(32),
//         expiresAt: new Date(START_DATE - 1000),
//         data: Buffer.from('test data')
//       })
//     } catch (e) {
//       assert.isTrue(e instanceof InsufficientTimeoutError)
//       assert.equal(e.message, "source transfer has already expired. sourceExpiry=2015-06-15T23:59:59.000Z currentTime=2015-06-16T00:00:00.000Z")
//       return
//     }

//     assert.fail("Did not throw expected error.")
//   })

//   it("throws InsufficientTimeoutError if the destination expiry window is less than the specified minimum expiration window for incoming packets", async function () {
//     const incomingPipeline = setPipelineReader('incoming', reduceExpiryRule, async (packet: IlpPrepare) => mockFulfill)

//     try {
//       await incomingPipeline({
//         amount: '50',
//         destination: 'test.connie.alice',
//         executionCondition: Buffer.alloc(32),
//         expiresAt: new Date(START_DATE + 1500),
//         data: Buffer.from('test data')
//       })
//     } catch (e) {
//       assert.isTrue(e instanceof InsufficientTimeoutError)
//       assert.equal(e.message, 'source transfer expires too soon to complete payment. actualSourceExpiry=2015-06-16T00:00:01.500Z requiredSourceExpiry=2015-06-16T00:00:02.000Z currentTime=2015-06-16T00:00:00.000Z')
//       return
//     }

//     assert.fail("Did not throw expected error.")
//   })

//   it("throws InsufficientTimeoutError if the destination expiry window is less than the specified minimum expiration window for outgoing packets", async function () {
//     const outgoingPipeline = setPipelineReader('outgoing', reduceExpiryRule, async (packet: IlpPrepare) => mockFulfill)

//     try {
//       await outgoingPipeline({
//         amount: '50',
//         destination: 'test.connie.alice',
//         executionCondition: Buffer.alloc(32),
//         expiresAt: new Date(START_DATE + 1500),
//         data: Buffer.from('test data')
//       })
//     } catch (e) {
//       assert.isTrue(e instanceof InsufficientTimeoutError)
//       assert.equal(e.message, 'source transfer expires too soon to complete payment. actualSourceExpiry=2015-06-16T00:00:01.500Z requiredSourceExpiry=2015-06-16T00:00:02.000Z currentTime=2015-06-16T00:00:00.000Z')
//       return
//     }

//     assert.fail("Did not throw expected error.")
//   })
// })
