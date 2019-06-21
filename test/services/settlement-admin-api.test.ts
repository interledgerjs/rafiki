import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { SettlementAdminApi } from '../../src/services/settlement-admin-api/settlement-admin-api'
import axios from 'axios'
import { App, PeerInfo, EndpointInfo, Config, STATIC_FULFILLMENT, STATIC_CONDITION } from '../../src'
import { IlpFulfill } from 'ilp-packet'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Settlement Admin Api', function () {
  let app: App
  let settlementAdminApi: SettlementAdminApi
  let config: Config
  const peerInfo: PeerInfo = {
    id: 'alice',
    assetCode: 'XRP',
    assetScale: 9,
    relation: 'child',
    rules: [{
      name: 'errorHandler'
    }, {
      name: 'balance'
    }],
    protocols: [{
      name: 'ildcp'
    }]
  }
  const endpointInfo: EndpointInfo = {
    type: 'http',
    httpOpts: {
      peerUrl: 'http://localhost:1234'
    }
  }

  beforeEach(async function () {
    config = new Config()
    app = new App(config, (string) => Promise.resolve(''))
    await app.addPeer(peerInfo, endpointInfo)
    settlementAdminApi = new SettlementAdminApi({}, { updateAccountBalance: app.updateBalance, getAccountBalance: app.getBalance, sendMessage: app.forwardSettlementMessage.bind(app)})
    settlementAdminApi.listen()
  })

  afterEach(function () {
    settlementAdminApi.shutdown()
  })

  it('health returns 200', async function () {
    const response = await axios.get('http://localhost:4000/health')

    assert.equal(response.status, 200)
  })

  describe('receiving a settlement from SE', function () {
    it('decreases interledger balance by prescribed amount', async () => {
      const data = {
        amount: "10",
        scale: 9
      }
      assert.equal(app.getBalance('alice').balance, '0')

      await axios.post('http://localhost:4000/accounts/alice/settlement', data)

      assert.equal(app.getBalance('alice').balance, '-10')
    })

    it('converts between different asset scales', async () => {
      const data = {
        amount: "1",
        scale: 6
      }

      await axios.post('http://localhost:4000/accounts/alice/settlement', data)

      assert.equal(app.getBalance('alice').balance, '-1000')
    })

    it('returns a 404 for unknown accountId', async () => {
      const data = {
        amount: "10",
        scale: 6
      }

      try {
        await axios.post('http://localhost:4000/accounts/bob/settlement', data)
      } catch (error) {
        assert.equal(error.response.status, 404)
        return
      }

      assert.fail('Did not throw error')
    })
  })

  describe('receive request to send message from SE', function () {

    it('calls sendMessageService', async () => {
      const clock = sinon.useFakeTimers()
      const connectorSendOutgoingRequestStub = sinon.stub(app.connector, 'sendOutgoingRequest').resolves({
        fulfillment: STATIC_FULFILLMENT,
        data: Buffer.allocUnsafe(0)
      } as IlpFulfill)
      const message = {
        type: 'config',
        data: {
          xrpAddress: 'rxxxxxx'
        }
      }

      const response = await axios.post('http://localhost:4000/accounts/alice/messages', Buffer.from(JSON.stringify(message)), { headers: { 'content-type': 'application/octet-stream' } })

      assert.equal(response.status, 200)
      assert.deepEqual(connectorSendOutgoingRequestStub.getCall(0).args[1], {
        amount: '0',
        destination: 'peer.settle',
        executionCondition: STATIC_CONDITION,
        expiresAt: new Date(Date.now() + 60000),
        data: Buffer.from(JSON.stringify(message))
      })
      connectorSendOutgoingRequestStub.restore()
      clock.restore()
    })

    it('returns a 404 for unknown accountId', async () => {
      const message = {
        type: 'config',
        data: {
          xrpAddress: 'rxxxxxx'
        }
      }

      try {
        await axios.post('http://localhost:4000/accounts/bob/messages', Buffer.from(JSON.stringify(message)), { headers: { 'content-type': 'application/octet-stream' } })
      } catch (error) {
        assert.equal(error.response.status, 404)
        return
      }

      assert.fail('Did not throw error')
    })
  })

})