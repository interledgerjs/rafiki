import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import App from '../src/app'
import Config from '../src/services/config'
import Connector from '../src/connector'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('App', function () {
  beforeEach(function () {
    process.env.CONNECTOR_ACCOUNTS = JSON.stringify({
      'usd-ledger': {
        relation: 'peer',
        assetCode: 'USD',
        assetScale: 4,
        endpoint: 'mock-ilp-endpoint',
        options: {}
      }
    })
  })

  describe('constructor', function () {
    it('loads config from options if specified', async function () {  
      const accounts = {
        'cad-ledger': {
          relation: 'peer',
          assetCode: 'CAD',
          assetScale: 4,
          endpoint: 'mock-ilp-endpoint',
          options: {}
        }
      }

      const app = new App({
        env: "test",
        accounts
      })
  
      assert.equal(app.config.accounts.toString(), accounts.toString())
    })
  
    it('loads config from env if no options are passed in', async function () {
      const app = new App()
  
      assert.isOk(app.config.accounts['usd-ledger'])
    })
  
    it('uses default middleware when creating accounts from config', async function () {
      const app = new App()

      
    })
  })


})