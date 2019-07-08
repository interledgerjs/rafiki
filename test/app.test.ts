import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import { getLocal, Mockttp } from 'mockttp'
import chaiAsPromised from 'chai-as-promised'
import { App } from '../src/app'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

import { connect, ClientHttp2Session, constants, createServer, Http2Server, Http2ServerRequest, Http2ServerResponse } from 'http2'
import { IlpPrepare, serializeIlpPrepare, deserializeIlpReply, IlpFulfill, serializeIlpFulfill } from 'ilp-packet';
import { PeerInfo } from '../src/types/peer';
import { ErrorHandlerRule } from '../src/rules/error-handler';
import { isEndpoint } from '../src/types/endpoint';
import { IldcpResponse, serializeIldcpResponse } from 'ilp-protocol-ildcp'
import { EndpointInfo, Config, STATIC_CONDITION, MAX_INT_64, MIN_INT_64 } from '../src'
import { PeerNotFoundError } from '../src/errors/peer-not-found-error';

import { Peer } from '../src/models/Peer'
import { Rule } from '../src/models/Rule'
import { Protocol } from '../src/models/Protocol'
import { Endpoint } from '../src/models/Endpoint'
import { DB } from './helpers/db';
import { Route } from '../src/models/Route'
import { Model } from 'objection'

const post = (client: ClientHttp2Session, authToken: string, path: string, body: Buffer): Promise<Buffer> => new Promise((resolve, reject) => {
  const req = client.request({
      [constants.HTTP2_HEADER_SCHEME]: "http",
      [constants.HTTP2_HEADER_METHOD]: constants.HTTP2_METHOD_POST,
      [constants.HTTP2_HEADER_PATH]: `/${path}`,
      [constants.HTTP2_HEADER_AUTHORIZATION]: `Bearer ${authToken}`
  })

  req.end(body)
  let chunks: Array<Buffer> = []
  req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
  })
  req.on('end', () => {
      chunks.length > 0 ? resolve(Buffer.concat(chunks)) : reject()
  })
  req.on('error', (error) => reject(error))
});

describe('Test App', function () {
  let client: ClientHttp2Session
  let aliceServer: Http2Server
  let app: App
  let db: DB
  let mockSEServer: Mockttp
  const peerInfo: PeerInfo = {
    id: 'alice',
    assetCode: 'XRP',
    assetScale: 9,
    relation: 'child',
    rules: [{
      name: 'errorHandler'
    }, {
      name: 'balance'
    }],
    protocols: [{
      name: 'ildcp'
    }]
  }
  const endpointInfo: EndpointInfo = {
    type: 'http',
    httpOpts: {
      peerUrl: 'http://localhost:1234'
    }
  }

  const parentEndpointInfo = {
    type: 'http',
    httpOpts: {
      peerUrl: 'http://localhost:8085'
    }
  }
  const parentInfo: PeerInfo = {
    id: 'bob',
    assetCode: 'XRP',
    assetScale: 9,
    relation: 'parent',
    rules: [{
      name: 'errorHandler'
    }],
    protocols: [{
      name: 'ildcp'
    }]
  }
  const parent2Info: PeerInfo = {
    id: 'drew',
    assetCode: 'XRP',
    assetScale: 9,
    relation: 'parent',
    relationWeight: 600,
    rules: [{
      name: 'errorHandler'
    }],
    protocols: [{
      name: 'ildcp'
    }]
  }
  const parent2EndpointInfo = {
    type: 'http',
    httpOpts: {
      peerUrl: 'http://localhost:8086'
    }
  }
  const config = new Config()
  config.loadFromOpts({ ilpAddress: 'test.harry', http2ServerPort: 8083 })
  const authFunction = (token: string) => new Promise<string>((resolve, reject) => {
    switch(token) {
      case "aliceToken":
        resolve('alice')
      case "bobToken":
          resolve('bob')
      case "drew":
          resolve('drewToken')
      default:
        reject()
    }
  })

  const aliceResponse: IlpFulfill = {
    data: Buffer.from(''),
    fulfillment: Buffer.alloc(32)
  }

  before(async () => {
    db = new DB()
    await db.setup()
    const alice = await Peer.query(db.knex()).insertAndFetch({ id: 'alice', assetCode: 'XRP', assetScale: 9, relation: 'child' })
    await alice.$relatedQuery<Rule>('rules', db.knex()).insert({ name: 'errorHandler' })
    await alice.$relatedQuery<Rule>('rules', db.knex()).insert({ name: 'balance' })
    await alice.$relatedQuery<Protocol>('protocols', db.knex()).insert({ name: 'ildcp' })
    await alice.$relatedQuery<Endpoint>('endpoint', db.knex()).insert({ type: 'http', options: { peerUrl: 'http://localhost:8084' }})
    // load routes into db
    await Route.query(db.knex()).insertAndFetch({ peerId: 'alice', targetPrefix: 'test.other.rafiki.bob' })
  })

  after(async () => {
    await db.teardown()
  })

  beforeEach(async () => {
    app = new App(config, authFunction, db.knex())
    await app.start()
    client = connect('http://localhost:8083')
    aliceServer = createServer((request: Http2ServerRequest, response: Http2ServerResponse) => {
      response.end(serializeIlpFulfill(aliceResponse))
    })
    aliceServer.listen(8084)
    mockSEServer = getLocal()
    mockSEServer.start(4000)
    await new Promise(resolve => setTimeout(() => resolve(), 100)) // give servers chance to start listening
  })

  afterEach(() => {
    app.shutdown()
    aliceServer.close()
    client.close()
    mockSEServer.stop()
  })

  it('can send a packet and receive reply from self', async function() {
    const ilpPrepare: IlpPrepare = {
      amount: '1',
      data: Buffer.from(''),
      destination: 'test.harry.alice',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(Date.now() + 34000)
    }

    const result = deserializeIlpReply(await post(client, 'aliceToken' , 'ilp', serializeIlpPrepare(ilpPrepare)))

    assert.deepEqual(result, {
      data: Buffer.from(''),
      fulfillment: Buffer.alloc(32)
    })
  })

  it('loads routes from db', async () => {
    const routes = app.connector.routingTable.getRoutingTable()

    assert.deepEqual(routes.get('test.other.rafiki.bob'), { nextHop: 'alice', path: [], weight: undefined, auth: undefined })
  })

  describe('add route', function () {
    it('stores route in db if store is true', async () => {
      app.addRoute('test.other.rafiki.drew', 'alice', true)

      const route = await Route.query(db.knex()).where('targetPrefix', 'test.other.rafiki.drew')
      assert.equal(route[0].peerId, 'alice')
      assert.equal(route[0].targetPrefix, 'test.other.rafiki.drew')
    })

    it('does not store route in db if store is false', async () => {
      app.addRoute('test.other.rafiki.fred', 'alice', false)

      const route = await Route.query(db.knex()).where('targetPrefix', 'test.other.rafiki.fred')
      assert.isEmpty(route)
    })
  })

  describe('shutdown', function () {
    it('tells connector to remove all peers', async function () {
      const removePeerSpy = sinon.spy(app.connector, 'removePeer')

      await app.shutdown()

      sinon.assert.calledWith(removePeerSpy, 'alice')
    })

    it('disposes of packet caches', async function () {
      const packetCacheSpies = Array.from(app['_packetCacheMap'].values()).map(cache => sinon.spy(cache, 'dispose'))

      await app.shutdown()

      packetCacheSpies.forEach(spy => sinon.assert.calledOnce(spy))
    })

    it('removes peers', async function () {
      await app.addPeer(peerInfo, endpointInfo)
      const removePeerSpy = sinon.spy(app, 'removePeer')

      await app.shutdown()

      sinon.assert.calledTwice(removePeerSpy)
      assert.equal(removePeerSpy.args[0][0], 'self')
      assert.equal(removePeerSpy.args[1][0], peerInfo.id)
    })
  })

  describe('addPeer', async function () {
    it('creates endpoint to be used by connector to add peer', async function () {
      const addPeerStub = sinon.stub(app.connector, 'addPeer').resolves()

      await app.addPeer(peerInfo, endpointInfo)

      const endpoint = addPeerStub.args[0][1]
      assert.isTrue(isEndpoint(endpoint))
    })

    it('creates and stores the business rules', async function () {
      await app.addPeer(peerInfo, endpointInfo)

      const businessRules = app.getRules(peerInfo.id)
      assert.include(businessRules.map(mw => mw.constructor.name), 'ErrorHandlerRule')
    })

    it('starts the business rules', async function () {
      const startSpy = sinon.spy(ErrorHandlerRule.prototype, 'startup')

      await app.addPeer(peerInfo, endpointInfo)

      sinon.assert.calledOnce(startSpy)
    })

    it('inherits address from parent', async function () {
      const config = new Config()
      config.loadFromOpts({ http2ServerPort: 8082 })
      const newDB = new DB()
      await newDB.setup()
      const newApp = new App(config, authFunction, newDB.knex())
      await newApp.start()
      const parentServer = createServer((request: Http2ServerRequest, response: Http2ServerResponse) => {
        const ildcpResponse: IldcpResponse = {
          assetCode: 'USD',
          assetScale: 2,
          clientAddress: 'test.alice.fred'
        } 
        response.end(serializeIldcpResponse(ildcpResponse))
      })
      const newAppClient = connect('http://localhost:8082')
      parentServer.listen(8085)
      
      assert.equal(newApp.connector.getOwnAddress(), 'unknown')

      await newApp.addPeer(parentInfo, parentEndpointInfo)
  
      assert.equal('test.alice.fred', newApp.connector.getOwnAddress())
      newApp.shutdown()
      parentServer.close()
      newAppClient.close()
      newDB.teardown()
    })

    it('inherits addresses from multiple parents', async function () {
      // parent 2 will have a higher relation weighting than parent 1. So when getOwnAdress is called, the address from parent 2 should be returned. But getOwnAddresses should return an array of addresses.
      const config = new Config()
      config.loadFromOpts({ http2ServerPort: 8082 })
      const newDB = new DB()
      await newDB.setup()
      const newApp = new App(config, authFunction, newDB.knex())
      await newApp.start()
      const parentServer = createServer((request: Http2ServerRequest, response: Http2ServerResponse) => {
        const ildcpResponse: IldcpResponse = {
          assetCode: 'USD',
          assetScale: 2,
          clientAddress: 'test.alice.fred'
        } 
        response.end(serializeIldcpResponse(ildcpResponse))
      })
      const parent2Server = createServer((request: Http2ServerRequest, response: Http2ServerResponse) => {
        const ildcpResponse: IldcpResponse = {
          assetCode: 'USD',
          assetScale: 2,
          clientAddress: 'test.drew.fred'
        } 
        response.end(serializeIldcpResponse(ildcpResponse))
      })
      const newAppClient = connect('http://localhost:8082')
      parentServer.listen(8085)
      parent2Server.listen(8086)
      
      assert.equal(newApp.connector.getOwnAddress(), 'unknown')
  
      await newApp.addPeer(parentInfo, parentEndpointInfo)
      await newApp.addPeer(parent2Info, parent2EndpointInfo)
  
      assert.equal(newApp.connector.getOwnAddress(), 'test.drew.fred')
      assert.deepEqual(newApp.connector.getOwnAddresses(), ['test.drew.fred', 'test.alice.fred'])
      newApp.shutdown()
      parentServer.close()
      parent2Server.close()
      newAppClient.close()
      newDB.teardown()
    })
  })

  describe('remove peer', function () {
    it('shuts down the rules', async function () {
      await app.addPeer(peerInfo, endpointInfo)
      const rules = app.getRules(peerInfo.id)
      const shutdownSpies = rules.map(rule => sinon.spy(rule, 'shutdown'))

      await app.removePeer(peerInfo.id)

      shutdownSpies.forEach(spy => sinon.assert.calledOnce(spy))
    })
  })

  describe('getBalance',function() {
    it('throws error if peer id is undefined', async function () {
      try {
        app.getBalance('unknown')
      } catch (error) {
        assert.equal(error.message, 'Cannot find balance for peerId=unknown')
        return
      }

      assert.fail('Did not throw expected error')
    })

    it('returns a balance json summary for a valid peer id', async function () {
      const peerInfo: PeerInfo = {
        id: 'drew',
        assetCode: 'XRP',
        assetScale: 9,
        relation: 'child',
        rules: [{
          name: 'errorHandler'
        }, {
          name: 'balance',
          minimum: '-10',
          maximum: '10'
        }],
        protocols: [{
          name: 'ildcp'
        }]
      }
      await app.addPeer(peerInfo, endpointInfo)

      const balance = app.getBalance('drew')

      assert.deepEqual(balance, {
        balance: '0',
        minimum: '-10',
        maximum: '10'
      })
    })
  })

  describe('updateBalance',function() {
    it('throws error if peer id is undefined', async function () {
      try {
        app.updateBalance('unknown', 100n, 6)
      } catch (error) {
        assert.isTrue(error instanceof PeerNotFoundError)
        return
      }

      assert.fail('Did not throw expected error')
    })

    it('updates balance for a valid peer id', async function () {
      const peerInfo: PeerInfo = {
        id: 'drew',
        assetCode: 'XRP',
        assetScale: 9,
        relation: 'child',
        rules: [{
          name: 'errorHandler'
        }, {
          name: 'balance',
          minimum: '-10',
          maximum: '200'
        }],
        protocols: [{
          name: 'ildcp'
        }]
      }
      await app.addPeer(peerInfo, endpointInfo)

      app.updateBalance('drew', 100n, 9)
      
      assert.deepEqual(app.getBalance('drew'), {
        balance: '100',
        minimum: '-10',
        maximum: '200'
      })
    })

    it('converts between asset scales when amountDiff asset scale is less than balances asset scale', async () => {
      const peerInfo: PeerInfo = {
        id: 'drew',
        assetCode: 'XRP',
        assetScale: 9,
        relation: 'child',
        rules: [{
          name: 'errorHandler'
        }, {
          name: 'balance',
          minimum: '-10',
          maximum: '2000'
        }],
        protocols: [{
          name: 'ildcp'
        }]
      }
      await app.addPeer(peerInfo, endpointInfo)

      app.updateBalance('drew', 1n, 6)
      
      assert.deepEqual(app.getBalance('drew'), {
        balance: '1000',
        minimum: '-10',
        maximum: '2000'
      })
    })
  })

  describe('getBalances', function () {
    it('returns object of balance summaries keyed by peerId', async function () {
      const peerInfo: PeerInfo = {
        id: 'drew',
        assetCode: 'XRP',
        assetScale: 9,
        relation: 'child',
        rules: [{
          name: 'errorHandler'
        }, {
          name: 'balance',
          minimum: '-10',
          maximum: '10'
        }],
        protocols: [{
          name: 'ildcp'
        }]
      }
      await app.addPeer(peerInfo, endpointInfo)

      const balances = app.getBalances()

      assert.deepEqual(balances, {
        'alice': {
          balance: '0',
          minimum: MIN_INT_64.toString(),
          maximum: MAX_INT_64.toString()
        },
        'drew': {
          balance: '0',
          minimum: '-10',
          maximum: '10'
        }
      })
    })
  })

  describe('forwardSettlementMessage', function () {
    it('packs message into peer.settle ilpPacket', async () => {
      const clock = sinon.useFakeTimers(Date.now())
      const connectorSendOutgoingRequestSpy = sinon.spy(app.connector, 'sendOutgoingRequest')
      const settlementMessage = Buffer.from(JSON.stringify({
        type: 'config',
        data: {
          xrpAddress: 'rxxxx'
        }
      }))

      app.forwardSettlementMessage('alice', settlementMessage)

      assert.deepEqual(connectorSendOutgoingRequestSpy.getCall(0).args[1], {
        amount: '0',
        destination: 'peer.settle',
        executionCondition: STATIC_CONDITION,
        expiresAt: new Date(Date.now() + 60000),
        data: settlementMessage
      })
      clock.restore()
      connectorSendOutgoingRequestSpy.restore()
    })
  })

  it('returns the data received from the counterparty connector', async function () {
    const settlementMessage = Buffer.from(JSON.stringify({
      type: 'config',
      data: {
        xrpAddress: 'rxxxx'
      }
    }))

    const response = await app.forwardSettlementMessage('alice', Buffer.from(settlementMessage))

    assert.deepEqual(response, aliceResponse.data)
    assert.isTrue(Buffer.isBuffer(response))
  })
  describe('add route', function () {
    it('adds the route to the connectors routing table', async function () {
      assert.notInclude(app.connector.routingTable.getRoutingTable()['prefixes'], 'test.alice')

      app.addRoute('test.alice', 'alice')

      assert.include(app.connector.routingTable.getRoutingTable()['prefixes'], 'test.alice')
    })

    it('throws error if specified peer does not exist', async function () {
      assert.throws(() => {
        app.addRoute('test.unknown.peer', 'unknownPeer')
      }, 'Cannot add route for unknown peerId=unknownPeer')
    })
  })

})