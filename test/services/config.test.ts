import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { Config } from '../../src/services/config'
import { App } from '../../src';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

const env = Object.assign({}, process.env)

describe('Config', function () {
  const peers = {
    'usd-ledger': {
      id: 'usd-ledger',
      relation: 'peer',
      assetCode: 'USD',
      assetScale: 4,
      rules: [{
        'name': 'expire'
      }],
      protocols: [],
      endpoint: {
        type: 'http',
        url: 'http://localhost:8084'
      }
    },
    'eur-ledger': {
      id: 'eur-ledger',
      relation: 'peer',
      assetCode: 'EUR',
      assetScale: 4,
      rules: [],
      protocols: [],
      endpoint: {
        type: 'http',
        url: 'http://localhost:8085'
      }
    }
  }

  describe('peers', function () {
    beforeEach(function () {
      process.env.CONNECTOR_PEERS = JSON.stringify(peers)
      process.env.CONNECTOR_MAX_HOLD_TIME = '2000'
      process.env.CONNECTOR_MIN_MESSAGE_WINDOW = '2000'
    })
  
    afterEach(() => {
      process.env = Object.assign({}, env)
    })
  
    it('parses peers from env variables', function () {
      const config = new Config()
  
      config.loadFromEnv()
  
      assert.deepEqual(<any>config.peers, peers)
    })
  
    it('parses peers from opts', function () {
      const config = new Config()
  
      config.loadFromOpts({ peers })
  
      assert.deepEqual(<any>config.peers, peers)
    })
  
    it('can be used to create peers on app', async function () {
      const config = new Config()
      config.loadFromEnv()
      const app = new App(config)
  
      Object.keys(config.peers).forEach(peer => app.addPeer(config.peers[peer], config.peers[peer]['endpoint']))
  
      assert.include(app.connector.getPeerList(), 'usd-ledger')
      assert.include(app.connector.getPeerList(), 'eur-ledger')
    })
  })

  describe('routes', function () {
    
    it('parses routes correctly', function () {
      const routes = [{
        targetPrefix: 'test.rafiki.eur-ledger',
        peerId: 'eur-ledger'
      }, {
        targetPrefix: 'test.rafiki.usd-ledger',
        peerId: 'usd-ledger'
      }]
      process.env.CONNECTOR_PEERS = JSON.stringify(peers)
      process.env.CONNECTOR_ROUTES = JSON.stringify(routes)
      const config = new Config()
      config.loadFromEnv()
      assert.deepEqual(routes, config.get('routes'))
    })
  
    it('won\'t parse routes with peer id format', function () {
      const routes = [{
        targetPrefix: 'test.rafiki.eur-ledger',
        peerId: 'garbage!'
      }, {
        targetPrefix: 'test.rafiki.usd-ledger',
        peerId: 'usd-ledger'
      }]
      process.env.CONNECTOR_PEERS = JSON.stringify(peers)
      process.env.CONNECTOR_ROUTES = JSON.stringify(routes)
      const config = new Config()
      assert.throws(() => {
        config.loadFromEnv()
      }, 'config failed to validate. error=should match pattern "^[a-zA-Z0-9._~-]+$" dataPath=.routes[0].peerId')
    })
  
    it('should not parse routes missing prefix', function () {
      const routes = [{
        targetPrefix: undefined,
        peerId: 'garbage!'
      }, {
        targetPrefix: 'test.rafiki.usd-ledger',
        peerId: 'usd-ledger'
      }]
      process.env.CONNECTOR_PEERS = JSON.stringify(peers)
      process.env.CONNECTOR_ROUTES = JSON.stringify(routes)
      const config = new Config()
      assert.throws(() => {
        config.loadFromEnv()
      }, 'config failed to validate. error=should have required property \'targetPrefix\' dataPath=.routes[0]')
    })
  
    it('should not parse routes missing peer id', function () {
      const routes = [{
        targetPrefix: 'test.rafiki.eur-ledger',
        peerId: undefined
      }, {
        targetPrefix: 'test.rafiki.usd-ledger',
        peerId: 'usd-ledger'
      }]
      process.env.CONNECTOR_PEERS = JSON.stringify(peers)
      process.env.CONNECTOR_ROUTES = JSON.stringify(routes)
  
      const config = new Config()
      assert.throws(() => {
        config.loadFromEnv()
      }, 'config failed to validate. error=should have required property \'peerId\' dataPath=.routes[0]')
    })
  
    it('validates that peers appearing in preconfigured routes exist in the peer list', async function () {
      const routes = [{
        targetPrefix: 'test.rafiki.alice',
        peerId: 'alice'
      }]
      process.env.CONNECTOR_PEERS = JSON.stringify(peers)
      process.env.CONNECTOR_ROUTES = JSON.stringify(routes)

      const config = new Config()
      assert.throws(() => {
        config.loadFromEnv()
      }, 'No peer configured for pre-configured route: {"targetPrefix":"test.rafiki.alice","peerId":"alice"}')
    })
  })

})
