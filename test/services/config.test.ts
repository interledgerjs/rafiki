import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import Config from '../../src/services/config'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

const env = Object.assign({}, process.env)

describe('Config', function () {

  describe('parseConnectorConfig', function () {
    beforeEach(function () {
      process.env.CONNECTOR_ACCOUNTS = JSON.stringify({
        'usd-ledger': {
          relation: 'peer',
          assetCode: 'USD',
          assetScale: 4,
          endpoint: 'mock-ilp-endpoint',
          options: {}
        },
        'eur-ledger': {
          relation: 'peer',
          assetCode: 'EUR',
          assetScale: 4,
          endpoint: 'mock-ilp-endpoint',
          options: {}
        },
        'aud-ledger': {
          relation: 'peer',
          assetCode: 'AUD',
          assetScale: 4,
          endpoint: 'mock-ilp-endpoint',
          options: {}
        }
      })
      process.env.CONNECTOR_PAIRS = ''
    })

    afterEach(() => {
      process.env = Object.assign({}, env)
    })

    describe('connector routes', () => {
      beforeEach(function () {
        this.routes = [{
          targetPrefix: 'a.',
          peerId: 'example.a'
        }]
      })

      afterEach(() => {
        process.env = Object.assign({}, env)
      })

      it('parses routes correctly', function () {
        process.env.CONNECTOR_ROUTES = JSON.stringify(this.routes)
        const config = new Config()
        config.loadFromEnv()
        assert.deepEqual(this.routes, config.get('routes'))
      })

      it('won\'t parse routes with invalid ledger', function () {
        this.routes[0].peerId = 'garbage!'
        process.env.CONNECTOR_ROUTES = JSON.stringify(this.routes)
        const config = new Config()
        assert.throws(() => {
          config.loadFromEnv()
        }, 'config failed to validate. error=should match pattern "^[a-zA-Z0-9._~-]+$" dataPath=.routes[0].peerId')
      })

      it('should not parse routes missing prefix', function () {
        this.routes[0].targetPrefix = undefined
        process.env.CONNECTOR_ROUTES = JSON.stringify(this.routes)
        const config = new Config()
        assert.throws(() => {
          config.loadFromEnv()
        }, 'config failed to validate. error=should have required property \'targetPrefix\' dataPath=.routes[0]')
      })

      it('should not parse routes missing ledger', function () {
        this.routes[0].peerId = undefined
        process.env.CONNECTOR_ROUTES = JSON.stringify(this.routes)

        const config = new Config()
        assert.throws(() => {
          config.loadFromEnv()
        }, 'config failed to validate. error=should have required property \'peerId\' dataPath=.routes[0]')
      })
    })

    describe('ledger credentials', () => {
      it('should parse ledger credentials', async function () {
        const accountCredentialsEnv = {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'CAD',
            assetScale: 9,
            endpoint: 'mock-ilp-endpoint',
            options: {
              account: 'http://cad-ledger.example:1000/accounts/mark',
              username: 'mark',
              password: 'mark'
            }
          },
          'usd-ledger': {
            relation: 'peer',
            assetCode: 'USD',
            assetScale: 9,
            endpoint: 'mock-ilp-endpoint',
            options: {
              account: 'http://cad-ledger.example:1000/accounts/mark',
              username: 'mark',
              cert: 'test/data/client1-crt.pem',
              key: 'test/data/client1-key.pem',
              ca: 'test/data/ca-crt.pem'
            }
          }
        }

        process.env.CONNECTOR_ACCOUNTS = JSON.stringify(accountCredentialsEnv)
        const config = new Config()
        config.loadFromEnv()

        const accountCredentials = {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'CAD',
            assetScale: 9,
            endpoint: 'mock-ilp-endpoint',
            options: {
              account: 'http://cad-ledger.example:1000/accounts/mark',
              username: 'mark',
              password: 'mark'
            }
          },
          'usd-ledger': {
            relation: 'peer',
            assetCode: 'USD',
            assetScale: 9,
            endpoint: 'mock-ilp-endpoint',
            options: {
              account: 'http://cad-ledger.example:1000/accounts/mark',
              username: 'mark',
              cert: 'test/data/client1-crt.pem',
              key: 'test/data/client1-key.pem',
              ca: 'test/data/ca-crt.pem'
            }
          }
        }
        
        assert.deepEqual(config.accounts.toString(), accountCredentials.toString())
      })

      it('should parse another type of ledger\'s credentials', async function () {
        const accountCredentialsEnv = {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'USD',
            assetScale: 9,
            endpoint: 'mock-ilp-endpoint',
            options: {
              token: 'iv8qhtm9qcmjmo8tcmjo4a',
              account: 'mark',
              type: 'other'
            }
          },
          'usd-ledger': {
            relation: 'peer',
            assetCode: 'USD',
            assetScale: 9,
            endpoint: 'mock-ilp-endpoint',
            options: {
              token: 'iv8qhtm9qcmjmo8tcmjo4a',
              account: 'mark',
              type: 'other'
            }
          }
        }

        process.env.CONNECTOR_ACCOUNTS = JSON.stringify(accountCredentialsEnv)
        const config = new Config()
        config.loadFromEnv()

        const accountCredentials = {
          'cad-ledger': {
            relation: 'peer',
            assetCode: 'USD',
            assetScale: 9,
            endpoint: 'mock-ilp-endpoint',
            options: {
              token: 'iv8qhtm9qcmjmo8tcmjo4a',
              account: 'mark',
              type: 'other'
            }
          },
          'usd-ledger': {
            relation: 'peer',
            assetCode: 'USD',
            assetScale: 9,
            endpoint: 'mock-ilp-endpoint',
            options: {
              token: 'iv8qhtm9qcmjmo8tcmjo4a',
              account: 'mark',
              type: 'other'
            }
          }
        }

        assert.deepEqual(config.accounts.toString(), accountCredentials.toString())
      })
    })
  })
})
