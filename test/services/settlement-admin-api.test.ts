import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { SettlementAdminApi } from '../../src/services/settlement-admin-api/settlement-admin-api'
import axios from 'axios'
import { App, PeerInfo, EndpointInfo, Config } from '../../src'

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
      name: 'balance',
      minimum: '-10',
      maximum: '200'
    }],
    protocols: [{
      name: 'ildcp'
    }],
    settlement: {
      url: 'http://test.settlement/ilp',
      ledgerAddress: 'r4SJQA3bXPBK6bMBwZeRhwGRemoRX7WjeM'
    }
  }
  const endpointInfo: EndpointInfo = {
    type: 'http',
    'url': 'http://localhost:1234'
  }

  beforeEach(async function () {
    config = new Config()
    app = new App(config)
    await app.addPeer(peerInfo, endpointInfo)
    settlementAdminApi = new SettlementAdminApi({}, { updateAccountBalance: app.updateBalance, getAccountBalance: app.getBalance})
    settlementAdminApi.listen()
  })

  afterEach(function () {
    settlementAdminApi.shutdown()
  })

  it('health returns 200', async function () {
    const response = await axios.get('http://localhost:4000/health')

    assert.equal(response.status, 200)
  })

  describe('get accounts/{accountID}/balance', function () {
    it('returns an object which has balance and timestamp keys', async function () {
      this.clock = sinon.useFakeTimers(START_DATE)

      const response = await axios.get('http://localhost:4000/accounts/alice/balance')

      assert.equal(response.status, 200)
      assert.deepEqual(response.data, {
        balance: '0',
        timestamp: Math.floor(START_DATE / 1000)
      })
      this.clock.restore()
    })

    it('requires accountId', async function () {
      try {
        await axios.post('http://localhost:4000/accounts//updateBalance', { amountDiff: '100' })
      } catch (error) {
        assert.equal(error.response.status, 404)
        return
      }

      assert.fail('Did not throw expected error')
    })
  })

  describe('post accounts/{accountID}/updateBalance', function () {
    it('updates the balance on the app', async function () {
      const response = await axios.post('http://localhost:4000/accounts/alice/updateBalance', { amountDiff: '100' })
  
      assert.equal(response.status, 200)
      assert.deepEqual(app.getBalance('alice'), {
        balance: '100',
        minimum: '-10',
        maximum: '200'
      })
    })

    it('requires amountDiff to be a string', async function () {
      try {
        await axios.post('http://localhost:4000/accounts/alice/updateBalance', { amountDiff: 100 })
      } catch (error) {
        assert.equal(error.response.status, 422)
        assert.equal(error.response.data.errors['amountDiff'].msg, 'amountDiff must be a string')
        return
      }

      assert.fail('Did not throw expected error')
    })

    it('requires accountId', async function () {
      try {
        await axios.post('http://localhost:4000/accounts//updateBalance', { amountDiff: '100' })
      } catch (error) {
        assert.equal(error.response.status, 404)
        return
      }

      assert.fail('Did not throw expected error')
    })
  })

})