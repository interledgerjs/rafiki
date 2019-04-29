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
      },
      settlement: {
        url: 'http://test.settlement/ilp',
        ledgerAddress: 'r4SJQA3bXPBK6bMBwZeRhwGRemoRX7WjeM'
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
      },
      settlement: {
        url: 'http://test.settlement/ilp',
        ledgerAddress: 'r4SJQA3bXPBK6bMBwZeRhwGRemoRX7WjeM'
      }
    }
  }

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

  // describe('connector routes', () => {
  //   beforeEach(function () {
  //     this.routes = [{
  //       targetPrefix: 'a.',
  //       peerId: 'example.a'
  //     }]
  //   })

  //   afterEach(() => {
  //     process.env = Object.assign({}, env)
  //   })

  //   it('parses routes correctly', function () {
  //     process.env.CONNECTOR_ROUTES = JSON.stringify(this.routes)
  //     const config = new Config()
  //     config.loadFromEnv()
  //     assert.deepEqual(this.routes, config.get('routes'))
  //   })

  //   it('won\'t parse routes with invalid ledger', function () {
  //     this.routes[0].peerId = 'garbage!'
  //     process.env.CONNECTOR_ROUTES = JSON.stringify(this.routes)
  //     const config = new Config()
  //     assert.throws(() => {
  //       config.loadFromEnv()
  //     }, 'config failed to validate. error=should match pattern "^[a-zA-Z0-9._~-]+$" dataPath=.routes[0].peerId')
  //   })

  //   it('should not parse routes missing prefix', function () {
  //     this.routes[0].targetPrefix = undefined
  //     process.env.CONNECTOR_ROUTES = JSON.stringify(this.routes)
  //     const config = new Config()
  //     assert.throws(() => {
  //       config.loadFromEnv()
  //     }, 'config failed to validate. error=should have required property \'targetPrefix\' dataPath=.routes[0]')
  //   })

  //   it('should not parse routes missing ledger', function () {
  //     this.routes[0].peerId = undefined
  //     process.env.CONNECTOR_ROUTES = JSON.stringify(this.routes)

  //     const config = new Config()
  //     assert.throws(() => {
  //       config.loadFromEnv()
  //     }, 'config failed to validate. error=should have required property \'peerId\' dataPath=.routes[0]')
  //   })
  // })
})
