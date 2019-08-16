import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {IlpFulfill, IlpPrepare, IlpReject} from 'ilp-packet'
import {AlertRule, Alerts} from '../../../rafiki-middleware/src/liquidity-check'
import {PeerInfo} from '../../src/types/peer'
import {setPipelineReader} from '../../src/types/rule'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Alert Rule', function () {
    let alertRule: AlertRule
    let alerts: Alerts

    const peerInfo: PeerInfo = {
      id: 'harry',
      relation: 'peer',
      assetScale: 9,
      assetCode: 'XRP',
      rules: [],
      protocols: []
    } 

    beforeEach( async function () {
      alerts = new Alerts()
      alertRule = new AlertRule({
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

      const sendOutgoing = setPipelineReader('outgoing', alertRule, async () => replyPacket)
      assert.isEmpty(alerts.getAlerts())
      const reply = await sendOutgoing(preparePacket)
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
      const sendOutgoing = setPipelineReader('outgoing', alertRule, async () => fulfillPacket)
      assert.isEmpty(alerts.getAlerts())
      await sendOutgoing(preparePacket)
      assert.isEmpty(alerts.getAlerts())
    })

})
