import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import {Pipelines} from '../../../src/types/middleware'
import { IlpPrepare, IlpReply, deserializeIlpFulfill, IlpReject, IlpFulfill } from 'ilp-packet';
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import AlertMiddleware from '../../../src/middleware/business/alert'
import { PeerInfo } from '../../../src/types/peer';

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Alert Middleware', function () {
    let pipelines: Pipelines
    let alertMiddleware: AlertMiddleware

    const peerInfo: PeerInfo = {
      id: 'harry',
      relation: 'peer',
      assertScale: 9,
      assetCode: 'XRP'
    } 

    beforeEach( async function () {
      alertMiddleware = new AlertMiddleware({peerInfo})
      pipelines = await constructPipelines({'alert' :alertMiddleware})
    })

    it('adds methods to the correct pipeline', async function() {
      assert.isEmpty(pipelines.incomingData.getMethods())
      assert.isNotEmpty(pipelines.outgoingData.getMethods())
      assert.equal(pipelines.outgoingData.getMethods().length, 1)
      assert.isEmpty(pipelines.startup.getMethods())
      assert.isEmpty(pipelines.shutdown.getMethods())
    })

    it('adds an alert for insufficient liquidity', async function () {
      const preparePacket: IlpPrepare = {
        amount: '49',
        executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
        expiresAt: new Date(START_DATE + 2000),
        destination: 'mock.test1',
        data: Buffer.alloc(0)
      }

      const replyPacket: IlpReject = {
        code: 'T04',
        triggeredBy: 'mock.test1',
        message: 'exceeded maximum balance.',
        data: Buffer.alloc(0)
      }

      let handler = constructMiddlewarePipeline(pipelines.incomingData, (data: IlpPrepare) => {
        return Promise.resolve(replyPacket)
      })
      assert.isEmpty(alertMiddleware.getAlerts())

      await handler(preparePacket)

      assert.isEmpty(alertMiddleware.getAlerts())
    })

    it('does not add an alert for normal packet', async function () {
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
      let handler = constructMiddlewarePipeline(pipelines.incomingData, (data: IlpPrepare) => {
        return Promise.resolve(fulfillPacket)
      })

      assert.isEmpty(alertMiddleware.getAlerts())

      await handler(preparePacket)

      assert.isEmpty(alertMiddleware.getAlerts())
    })

})