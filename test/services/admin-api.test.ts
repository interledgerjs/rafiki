import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { AdminApi } from '../../src/services/admin-api'
import axios from 'axios'
import { PeerInfo } from '../../src/types/peer'
import { App } from '../../src/app'
import { EndpointInfo, AuthFunction } from '../../src'
import { Config } from '../../src'
import { AuthService } from '../../src/services/auth';
import { DB } from '../helpers/db'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
describe('Admin Api', function () {

  let app: App
  let adminApi: AdminApi
  let db: DB
  const config = new Config()
  
  beforeEach(async function () {
    db = new DB()
    await db.setup()
    const authService = new AuthService()
    const authFunction: AuthFunction = (token: string) => Promise.resolve('bob') 
    app = new App(config, authFunction, db.knex())
    adminApi = new AdminApi({},{ app, authService })
    adminApi.listen()
  })

  afterEach(async function () {
    adminApi.shutdown()
    app.shutdown()
    db.teardown()
  })

  it('starts an http server if admin api is true in config', async function (){
    try{
      const response = await axios.get('http://127.0.0.1:7780/health')
      assert.equal(response.data, "Status: ok")
      return
    }
    catch  (error) {}
    assert.fail('Could not connect to admin api server')
  })

  it('returns 404 for unknown route', async function () {
    try{
      const response = await axios.get('http://127.0.0.1:7780/unknownRoute')
    }
    catch  (error) {
      assert.equal(error.response.status, 404)
      return
    }
    assert.fail('Did not throw a 404 for an unknown route')
  })

  describe('getHealth', function () {
    it('returns 200', async function () {

      const response = await axios.get('http://127.0.0.1:7780/health')
      
      assert.equal(200, response.status)
    })
  })

  describe('getStats', function () {
    it('returns the collected stats', async function () {

      try{
        const response = await axios.get('http://127.0.0.1:7780/stats')
        const metrics = response.data
        const expected = [{
          help: 'Total number of incoming ILP packets',
          name: 'ilp_connector_incoming_ilp_packets',
          type: 'counter',
          values: [],
          aggregator: 'sum'
        },
        {
          help: 'Total value of incoming ILP packets',
          name: 'ilp_connector_incoming_ilp_packet_value',
          type: 'counter',
          values: [],
          aggregator: 'sum'
        },
        {
          help: 'Total number of outgoing ILP packets',
          name: 'ilp_connector_outgoing_ilp_packets',
          type: 'counter',
          values: [],
          aggregator: 'sum'
        },
        {
          help: 'Total value of outgoing ILP packets',
          name: 'ilp_connector_outgoing_ilp_packet_value',
          type: 'counter',
          values: [],
          aggregator: 'sum'
        },
        {
          help: 'Total of incoming money',
          name: 'ilp_connector_incoming_money',
          type: 'gauge',
          values: [],
          aggregator: 'sum'
        },
        {
          help: 'Total of outgoing money',
          name: 'ilp_connector_outgoing_money',
          type: 'gauge',
          values: [],
          aggregator: 'sum'
        },
        {
          help: 'Total of rate limited ILP packets',
          name: 'ilp_connector_rate_limited_ilp_packets',
          type: 'counter',
          values: [],
          aggregator: 'sum'
        },
        {
          help: 'Total of rate limited money requests',
          name: 'ilp_connector_rate_limited_money',
          type: 'counter',
          values: [],
          aggregator: 'sum'
        },
        {
          help: 'Balances on peer account',
          name: 'ilp_connector_balance',
          type: 'gauge',
          values: [],
          aggregator: 'sum'
        }]

        assert.deepEqual(metrics, expected)
        return
      } catch (error) {}
      assert.fail('Could not get metrics')
    })
  })

  describe('getAlerts', function () {
    it('returns no alerts by default', async function () {
      const response = await axios.get('http://127.0.0.1:7780/alerts')
      assert.deepEqual(response.data, {alerts: []})
    })

    it('returns an alert when a peer returns "maximum balance exceeded"') // TODO: complete when balance rule is added
  })

  describe('getBalances', function () {
    it('returns balances and limits for all peers', async function () {
      const alicePeerInfo: PeerInfo = {
        id: 'alice',
        assetCode: 'USD',
        assetScale: 2,
        relation: 'peer',
        rules: [{
          name: 'balance',
          minimum: '0',
          maximum: '400'
        }],
        protocols: []
      }
      const aliceEndpointInfo: EndpointInfo = {
        type: 'http',
        httpOpts: {
          peerUrl: 'http://localhost:8084'
        }
      }
      const bobPeerInfo: PeerInfo = {
        id: 'bob',
        assetCode: 'USD',
        assetScale: 2,
        relation: 'peer',
        rules: [{
          name: 'balance',
          minimum: '0',
          maximum: '200'
        }],
        protocols: []
      }
      const bobEndpointInfo: EndpointInfo = {
        type: 'http',
        httpOpts: {
          peerUrl: 'http://localhost:8085'
        }
      }
      const expectedBalances = {
        'alice': {
          'balance': '0',
          'minimum': '0',
          'maximum': '400'
        },
        'bob': {
          'balance': '0',
          'minimum': '0',
          'maximum': '200'
        }
      }
      await axios.post('http://127.0.0.1:7780/peer', { peerInfo: alicePeerInfo, endpointInfo: aliceEndpointInfo })
      await axios.post('http://127.0.0.1:7780/peer', { peerInfo: bobPeerInfo, endpointInfo: bobEndpointInfo })

      const response = await axios.get('http://127.0.0.1:7780/balance')

      assert.deepEqual(response.data, expectedBalances)
    })
  })

  describe('addPeer', function () {
    it('returns 204 on successful addition of peer', async function () {
      const addPeerSpy = sinon.spy(app, 'addPeer')
      const peerInfo: PeerInfo = {
        id: 'alice',
        assetCode: 'USD',
        assetScale: 2,
        relation: 'peer',
        rules: [],
        protocols: []
      }
      const endpointInfo: EndpointInfo = {
        type: 'http',
        httpOpts: {
          peerUrl: 'http://localhost:8084'
        }
      }

      const response = await axios.post('http://127.0.0.1:7780/peer', { peerInfo, endpointInfo })

      assert.equal(response.status, 204)
      sinon.assert.calledWith(addPeerSpy, peerInfo, endpointInfo)
    })

    it('can add a plugin endpoint using xrp-asym-server', async function () {
      const addPeerSpy = sinon.spy(app, 'addPeer')
      const peerInfo: PeerInfo = {
        "relation": "child",
        "id": "test",
        "assetCode": "XRP",
        "assetScale": 9,
        "rules": [],
        "protocols": [{
          name: 'ildcp'
        }]
      }
      const endpointInfo: EndpointInfo = {
        "type": "plugin",
        "pluginOpts": {
            "name": "ilp-plugin-xrp-asym-server",
            "opts": {
              "port": "6666",
              "address": "rKzfaLjeVZXasCSU2heTUGw9VhQmFNSd8k",
              "secret": "snHNnoL6S67wNvydcZg9y9bFzPZwG",
              "xrpServer": "wss://s.altnet.rippletest.net:51233",
              "maxBalance": "100000",
              "maxPacketAmount": "1000"
            }
        }
      }

      const response = await axios.post('http://127.0.0.1:7780/peer', { peerInfo, endpointInfo })

      assert.equal(response.status, 204)
      sinon.assert.calledWith(addPeerSpy, peerInfo, endpointInfo)
    })

    it('stores the route for the peer in the database', async () => {
      const peerInfo: PeerInfo = {
        id: 'fred',
        assetCode: 'USD',
        assetScale: 2,
        relation: 'peer',
        rules: [],
        protocols: []
      }
      const endpointInfo: EndpointInfo = {
        type: 'http',
        httpOpts: {
          peerUrl: 'http://localhost:8084'
        }
      }

      const response = await axios.post('http://127.0.0.1:7780/peer', { peerInfo, endpointInfo })

      assert.equal(response.status, 204)
    })
  })

  describe('getRoutes', function () {
    it('returns the routing table', async function () {
      const peerInfo: PeerInfo = {
        id: 'alice',
        assetCode: 'USD',
        assetScale: 2,
        relation: 'peer',
        rules: [],
        protocols: []
      }
      const endpointInfo: EndpointInfo = {
        type: "http",
        httpOpts: {
          peerUrl: 'http://localhost:8085'
        }
      }
      app.addPeer(peerInfo, endpointInfo)
      app.addRoute('test.rafiki.alice', 'alice')

      const response = await axios.get('http://127.0.0.1:7780/routes')
      
      assert.equal(response.status, 200)
      assert.deepEqual(response.data, {
        "test.rafiki.alice": {
            "nextHop": "alice",
            "path": []
        }
      })
    })
  })
})