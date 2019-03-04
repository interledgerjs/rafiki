import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import App from '../src/app'
import mock = require('mock-require')
import MockIlpEndpoint from './mocks/mockIlpEndpoint'
import * as ILDCP from "ilp-protocol-ildcp"
Chai.use(chaiAsPromised)

const assert = Object.assign(Chai.assert, sinon.assert)

describe('App', function () {
  let app: App
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
    process.env.CONNECTOR_ILP_ADDRESS = 'test.connie.alice'
    process.env.DEBUG = '*'
    mock('mock-ilp-endpoint', MockIlpEndpoint)
  })

  afterEach(function () {
    if(app) app.shutdown()
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

      app = new App({
        env: "test",
        accounts
      })
  
      assert.equal(app.config.accounts.toString(), accounts.toString())
    })
  
    it('loads config from env if no options are passed in', async function () {
      app = new App()
  
      assert.isOk(app.config.accounts['usd-ledger'])
    })

    it('sets connector address if it is specified in the config', async function () {
      app = new App({
        env: "test",
        accounts: {
          'cad-ledger': {
            relation: 'parent',
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
      const expectedMiddleware = ['ExpireMiddleware', 'ReduceExpiryMiddleware', 'ErrorHandlerMiddleware', 'RateLimitMiddleware', 'MaxPacketAmountMiddleware', 'ThroughputMiddleware', 'DeduplicateMiddleware', 'ValidateFulfillmentMiddleware', 'StatsMiddleware', 'AlertMiddleware']
      app = new App()
      const addPeerStub = sinon.stub(app.connector, 'addPeer').resolves()

      await app.start()

      const middleware = addPeerStub.args[0][2]

      const middlewareTypes = middleware.map(mw => mw.constructor.name)
      assert.deepEqual(middlewareTypes, expectedMiddleware)
    })

    it('does not apply disabled middleware', async function () {
      const expectedMiddleware = ['ExpireMiddleware', 'ReduceExpiryMiddleware', 'RateLimitMiddleware', 'MaxPacketAmountMiddleware', 'DeduplicateMiddleware', 'ValidateFulfillmentMiddleware', 'StatsMiddleware', 'AlertMiddleware']
      app = new App({
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
        disableMiddleware: ['errorHandler', 'throughput'],
        ilpAddress: 'test.connie'
      })

      const addPeerStub = sinon.stub(app.connector, 'addPeer').resolves()

      await app.start()

      const middleware = addPeerStub.args[0][2]
      const middlewareTypes = middleware.map(mw => mw.constructor.name)
      assert.deepEqual(middlewareTypes, expectedMiddleware)
    })

    it('creates endpoint to be used by peer', async function () {
      app = new App({
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
        disableMiddleware: ['errorHandler', 'throughput'],
        ilpAddress: 'test.connie'
      })

      const addPeerStub = sinon.stub(app.connector, 'addPeer').resolves()

      await app.start()

      const endpoint = addPeerStub.args[0][1]
      assert.isOk(endpoint instanceof MockIlpEndpoint)
    })

    it('tells adminApi to start listening', async function () {
      app = new App()
      const adminApiListenSpy = sinon.spy(app.adminApi, 'listen')

      await app.start()

      sinon.assert.calledOnce(adminApiListenSpy)
    })

    it('inherits address from parent', async function () {
      const ildcpResponse = {
        clientAddress: 'test.fred.bob',
        assetCode: 'USD',
        assetScale: 2
      } as ILDCP.IldcpResponse
      const ildcpStub = sinon.stub(ILDCP, 'fetch').resolves(ildcpResponse)
      app = new App({
        env: "test",
        accounts: {
          'fred': {
            relation: 'parent',
            assetCode: 'CAD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          }
        }
      })

      await app.start()

      assert.equal(app.connector.getOwnAddress(), 'test.fred.bob')
      ildcpStub.restore()
    })

    it('uses ilpAddressInheritFrom when there are multiple parents', async function () {
      const ildcpResponse = {
        clientAddress: 'test.fred.bob',
        assetCode: 'USD',
        assetScale: 2
      } as ILDCP.IldcpResponse
      const ildcpStub = sinon.stub(ILDCP, 'fetch').resolves(ildcpResponse)
      app = new App({
        env: "test",
        accounts: {
          'fred': {
            relation: 'parent',
            assetCode: 'CAD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          },
          'bruno': {
            relation: 'parent',
            assetCode: 'CAD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          }
        },
        ilpAddressInheritFrom: 'bruno'
      })
      const addPeerStub = sinon.spy(app.connector, 'addPeer')

      await app.start()

      assert.equal('fred', addPeerStub.args[0][0].id)
      assert.isFalse(addPeerStub.args[0][3])
      assert.equal('bruno', addPeerStub.args[1][0].id)
      assert.isTrue(addPeerStub.args[1][3])
      sinon.assert.calledOnce(ildcpStub)
      assert.equal('test.fred.bob', app.connector.getOwnAddress())
      ildcpStub.restore()
    })

    it('throws error if the ilp address isn\'t set in the config and there are no parents to inherit from', async function () {
      app = new App({
        env: "test",
        accounts: {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'CAD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          }
        }
      })

      try {
        await app.start()
      } catch (e) {
        assert.equal(e.message, "ILP address must be specified in configuration when there is no parent.")
        return
      }
      assert.fail()
    })
  })

  describe('shutdown', function () {
    beforeEach(async function () {
      app = new App({
        env: "test",
        accounts: {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'CAD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          },
          'usd-ledger': {
            relation: 'peer',
            assetCode: 'USD',
            assetScale: 4,
            endpoint: 'mock-ilp-endpoint',
            options: {}
          }
        },
        ilpAddress: 'test.connie'
      })

      await app.start()
    })

    it('tells connector to remove all peers', async function () {
      const removePeerSpy = sinon.spy(app.connector, 'removePeer')

      await app.shutdown()

      sinon.assert.calledWith(removePeerSpy, 'cad-ledger')
      sinon.assert.calledWith(removePeerSpy, 'usd-ledger')
    })

    it('disposes of packet caches', async function () {
      const packetCacheSpies = Array.from(app.packetCacheMap.values()).map(cache => sinon.spy(cache, 'dispose'))

      await app.shutdown()

      packetCacheSpies.forEach(spy => sinon.assert.calledOnce(spy))
    })

    it('tells adminApi to shutdown', async function () {
      const adminApiShutdownSpy = sinon.spy(app.adminApi, 'shutdown')

      await app.shutdown()

      sinon.assert.calledOnce(adminApiShutdownSpy)
    })
  })

})