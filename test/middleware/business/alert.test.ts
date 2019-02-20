import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpReply, deserializeIlpFulfill, IlpReject, IlpFulfill } from 'ilp-packet';
import { AlertMiddleware, Alerts } from '../../../src/middleware/business/alert'
import { PeerInfo } from '../../../src/types/peer';
import { setPipelineHandler } from '../../../src/types/middleware';

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Alert Middleware', function () {
    let alertMiddleware: AlertMiddleware
    let alerts: Alerts

    const peerInfo: PeerInfo = {
      id: 'harry',
      relation: 'peer',
      assetScale: 9,
      assetCode: 'XRP'
    } 

    beforeEach( async function () {
      alerts = new Alerts()
      alertMiddleware = new AlertMiddleware({
        createAlert: (triggeredBy: string, message: string) => {
          return alerts.createAlert('harry', triggeredBy, message)
        }
      })
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

      setPipelineHandler('incoming', alertMiddleware, async () => replyPacket)
      assert.isEmpty(alerts.getAlerts())
      await alertMiddleware.incoming.request(preparePacket)
      assert.isNotEmpty(alerts.getAlerts())
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
      setPipelineHandler('incoming', alertMiddleware, async () => fulfillPacket)
      assert.isEmpty(alerts.getAlerts())
      await alertMiddleware.incoming.request(preparePacket)
      assert.isEmpty(alerts.getAlerts())
    })

})