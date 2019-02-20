import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import App from '../src/app'
import mock = require('mock-require')
import MockIlpEndpoint from './mocks/mockIlpEndpoint'

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
    process.env.DEBUG = '*'
    mock('mock-ilp-endpoint', MockIlpEndpoint)
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

    it('sets connector address if it is specified in the config', async function () {
      const app = new App({
        env: "test",
        accounts: {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'CAD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          }
        },
        ilpAddress: 'test.connie'
      })
      
      const connectorsAddress = app.connector.getOwnAddress()

      assert.equal(connectorsAddress, 'test.connie')      
    })
  })

  describe('start', function () {
    it('adds default middleware', async function () {
      const expectedMiddleware = ['ExpireMiddleware', 'ErrorHandlerMiddleware', 'RateLimitMiddleware', 'MaxPacketAmountMiddleware', 'ThroughputMiddleware', 'DeduplicateMiddleware', 'ValidateFulfillmentMiddleware', 'StatsMiddleware', 'AlertMiddleware']
      const app = new App()
      const addPeerStub = sinon.stub(app.connector, 'addPeer').resolves()

      await app.start()

      const middleware = addPeerStub.args[0][2]

      const middlewareTypes = middleware.map(mw => mw.constructor.name)
      assert.deepEqual(middlewareTypes, expectedMiddleware)
    })

    it('does not apply disabled middleware', async function () {
      const expectedMiddleware = ['ExpireMiddleware', 'RateLimitMiddleware', 'MaxPacketAmountMiddleware', 'DeduplicateMiddleware', 'ValidateFulfillmentMiddleware', 'StatsMiddleware', 'AlertMiddleware']
      const app = new App({
        env: "test",
        accounts: {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'CAD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          }
        },
        disableMiddleware: ['errorHandler', 'throughput']
      })

      const addPeerStub = sinon.stub(app.connector, 'addPeer').resolves()

      await app.start()

      const middleware = addPeerStub.args[0][2]
      const middlewareTypes = middleware.map(mw => mw.constructor.name)
      assert.deepEqual(middlewareTypes, expectedMiddleware)
    })

    it('creates endpoint to be used by peer', async function () {
      const app = new App({
        env: "test",
        accounts: {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'CAD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          }
        },
        disableMiddleware: ['errorHandler', 'throughput']
      })

      const addPeerStub = sinon.stub(app.connector, 'addPeer').resolves()

      await app.start()

      const endpoint = addPeerStub.args[0][1]
      assert.isOk(endpoint instanceof MockIlpEndpoint)
    })
  })

})