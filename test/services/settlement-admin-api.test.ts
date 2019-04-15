import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { SettlementAdminApi } from '../../src/services/settlement-admin-api/settlement-admin-api'
import axios from 'axios'
import { Threshold } from '../../src/types/threshold';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Settlement Admin Api', function () {
  let settlementAdminApi: SettlementAdminApi
  let accountId: string | undefined
  let amountDiff: bigint | undefined
  let thresholds: Threshold[] | undefined
  const updateAccountBalance = (id: string, diff: bigint) => {
    accountId = id
    amountDiff = diff
  }
  const updateAccountThresholds = (id: string, thresholdsArray: Threshold[]) => {
    accountId = id
    thresholds = thresholdsArray
  }

  beforeEach(function () {
    settlementAdminApi = new SettlementAdminApi({}, { updateAccountBalance, updateAccountThresholds })
    settlementAdminApi.connect()
    accountId = undefined
    amountDiff = undefined
    thresholds = undefined
  })

  afterEach(function () {
    settlementAdminApi.disconnect()
  })

  it('health returns 200', async function () {
    const response = await axios.get('http://localhost:4000/health')

    assert.equal(response.status, 200)
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

  describe('put accounts/{accountId}/thresholds', function () {
    it('calls the updateAccountThreshold service', async function () {
      const response = await axios.put('http://localhost:4000/accounts/alice/thresholds', { thresholds: [
        {
          label: 'presettlement',
          balance: '-2000'
        },
        {
          label: 'settlement',
          balance: '-1000'
        }
      ]})
  
      assert.equal(accountId, 'alice')
      assert.deepEqual(thresholds, [
        {
          label: 'presettlement',
          balance: -2000n
        },
        {
          label: 'settlement',
          balance: -1000n
        }
      ])
      assert.equal(response.status, 200)
    })

    it('thresholds must be an array', async function () {
      try {
        await axios.put('http://localhost:4000/accounts/alice/thresholds', { thresholds: {
          label: 'presettlement',
          balance: '-2000'
        }})
      } catch (error) {
        assert.equal(error.response.status, 422)
        return
      }
  
      assert.fail('Did not throw expected exception.')
    })

    it('entry in thresholds must have label and balance key', async function () {
      try {
        await axios.put('http://localhost:4000/accounts/alice/thresholds', { thresholds: [
          {
            label: 'presettlement'
          },
          {
            balance: '-2000'
          }
        ]})
      } catch (error) {
        assert.equal(error.response.status, 422)
        assert.equal(error.response.data.errors['thresholds[1].label'].msg, 'threshold label must be a string')
        assert.equal(error.response.data.errors['thresholds[0].balance'].msg, 'threshold balance must be a string')
        return
      }
  
      assert.fail('Did not throw expected exception.')
    })
  })
})