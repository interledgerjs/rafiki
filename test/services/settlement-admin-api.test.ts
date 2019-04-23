import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { SettlementAdminApi } from '../../src/services/settlement-admin-api/settlement-admin-api'
import axios from 'axios'
import { JSONBalanceSummary } from '../../src'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Settlement Admin Api', function () {
  let settlementAdminApi: SettlementAdminApi
  let accountId: string | undefined
  let amountDiff: bigint | undefined
  const updateAccountBalance = (id: string, diff: bigint) => {
    accountId = id
    amountDiff = diff
  }
  const getAccountBalance = (id: string): JSONBalanceSummary => {
    return {
      balance: '1000',
      minimum: '0',
      maximum: '100'
    }
  }

  beforeEach(function () {
    settlementAdminApi = new SettlementAdminApi({}, { updateAccountBalance, getAccountBalance })
    settlementAdminApi.listen()
    accountId = undefined
    amountDiff = undefined
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
        balance: '1000',
        timestamp: Math.floor(START_DATE / 1000)
      })
      this.clock.restore()
    })
  })

  describe('post accounts/{accountID}/updateBalance', function () {
    it('calls the updateAccountBalance service', async function () {
      const response = await axios.post('http://localhost:4000/accounts/alice/updateBalance', { amountDiff: '100' })
  
      assert.equal(accountId, 'alice')
      assert.equal(amountDiff, 100n) // amountDiff must be converted to a bigint
      assert.equal(response.status, 200)
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