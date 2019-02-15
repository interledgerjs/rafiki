// import 'mocha'
// import * as sinon from 'sinon'
// import * as Chai from 'chai'
// import * as chaiAsPromised from 'chai-as-promised'
// Chai.use(chaiAsPromised)
// const assert = Object.assign(Chai.assert, sinon.assert)
// import {Pipelines} from '../../../src/types/middleware'
// import { IlpPrepare, IlpReply, deserializeIlpFulfill } from 'ilp-packet';
// import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
// import BalanceMiddleware from '../../../src/middleware/business/balance'

// const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

// describe('Balance Middleware', function () {
//     let pipelines: Pipelines
//     let balanceMiddleware: BalanceMiddleware

//     beforeEach( async function () {
//       balanceMiddleware = new BalanceMiddleware()
//       pipelines = await constructPipelines({'balance' :balanceMiddleware})
//     })

//     it('adds methods to the correct pipeline', async function() {
//       assert.isNotEmpty(pipelines.incomingData.getMethods())
//       assert.equal(pipelines.incomingData.getMethods().length, 1)
//       assert.isEmpty(pipelines.outgoingData.getMethods())
//       assert.isEmpty(pipelines.startup.getMethods())
//       assert.isEmpty(pipelines.shutdown.getMethods())
//     })

// })