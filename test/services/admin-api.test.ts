import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { AdminApi } from '../../src/services/admin-api'
import axios from 'axios'
import { PeerInfo } from '../../src/types/peer'
import { App } from '../../src/app'
import { SettlementEngine } from '../../src/services/settlement-engine'
import { EndpointInfo, AuthFunction } from '../../src'
import { Redis } from 'ioredis'
import { Config } from '../../src'
const RedisMock = require('ioredis-mock')

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
describe('Admin Api', function () {

  let app: App
  let adminApi: AdminApi
  let settlementEngine: SettlementEngine
  let redis: Redis
  const config = new Config()

  beforeEach(function () {
    const authFunction: AuthFunction = (token: string) => Promise.resolve('bob') 
    app = new App(config, authFunction)
    redis = new RedisMock()
    settlementEngine = new SettlementEngine({ streamKey: 'balance', redisClient: redis })
    adminApi = new AdminApi({},{ app, settlementEngine })
    adminApi.listen()
  })

  afterEach(function () {
    adminApi.shutdown()
    app.shutdown()
  })

  it('starts an http server if admin api is true in config', async function (){
    try{
      // stub redis status
      redis.status = 'ready'
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
    it('returns 500 if settlement engine is not connected to redis', async function () {
      try {
        // stub redis status
        redis.status = 'connecting'
        await axios.get('http://127.0.0.1:7780/health')
      }
      catch  (error) {
        assert.equal(error.response.status, 500)
        return
      }
      assert.fail('Did not return expected error code')
    })

    it('returns 200 if settlement engine is connected to redis', async function () {
      // stub redis status
      redis.status = 'ready'

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
      settlementEngine.setBalance('alice', 300n, 0n, 400n)
      settlementEngine.setBalance('bob', 100n, 0n, 200n)
      const expectedBalances = {
        'alice': {
          'balance': '300',
          'minimum': '0',
          'maximum': '400'
        },
        'bob': {
          'balance': '100',
          'minimum': '0',
          'maximum': '200'
        }
      }

      const response = await axios.get('http://127.0.0.1:7780/balance')

      assert.deepEqual(response.data, expectedBalances)
    })
  })

  describe('updateBalance', function ()  {
    it('updates the balance of the specified peer and returns the balance', async function () {
      settlementEngine.setBalance('alice', 100n, 0n, 400n)

      const response = await axios.post('http://127.0.0.1:7780/balance', { peerId: 'alice', amountDiff: '100' })

      assert.deepEqual(response.data, {
        'balance': '200',
        'minimum': '0',
        'maximum': '400'
      })      
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
        url: 'http://localhost:8084'
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
        url: 'http://localhost:8084'
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