import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import { getLocal, Mockttp } from 'mockttp'
import chaiAsPromised from 'chai-as-promised'
import {App, Config, EndpointInfo, STATIC_CONDITION} from '../src'
import {deserializeIlpReply, IlpFulfill, IlpPrepare, serializeIlpFulfill, serializeIlpPrepare} from 'ilp-packet'
import {isEndpoint, PeerInfo} from '../src/types'
import {ErrorHandlerRule} from '../src/rules'
import {IldcpResponse, serializeIldcpResponse} from 'ilp-protocol-ildcp'
import {PeerNotFoundError} from '../src/errors/peer-not-found-error'
import {tokenAuthMiddleware} from '../src/koa/token-auth-middleware'
import {Peer} from '../src/models/Peer'
import {Rule} from '../src/models/Rule'
import {Protocol} from '../src/models/Protocol'
import {Endpoint} from '../src/models/Endpoint'
import {DB} from './helpers/db'
import {Route} from '../src/models/Route'
import Axios from 'axios'
import Koa from 'koa'
import createRouter from 'koa-joi-router'
import { Server } from 'net'
import { MockTokenService } from './mocks/mockTokenService';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Test App', function () {
  let addPeerSpyForAppConstructor: sinon.SinonSpy
  let aliceServer: Server
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
      peerUrl: 'http://localhost:1234/ilp'
    }
  }

  const parentEndpointInfo = {
    type: 'http',
    httpOpts: {
      peerUrl: 'http://localhost:8085/ilp'
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
      peerUrl: 'http://localhost:8086/ilp'
    }
  }
  const config = new Config()
  config.loadFromOpts({ ilpAddress: 'test.harry', httpServerPort: 8083 })
  const tokenService = new MockTokenService()
  tokenService.store("alicetoken", { active: true, sub: 'alice' })
  tokenService.store("bobtoken", { active: true, sub: 'bob' })
  tokenService.store("drewToken", { active: true, sub: 'drew' })

  const aliceResponse: IlpFulfill = {
    data: Buffer.from(''),
    fulfillment: Buffer.alloc(32)
  }

  before(async () => {
    db = new DB()
    await db.setup()
    const alice = await Peer.query(db.knex()).insertAndFetch({ id: 'alice', assetCode: 'XRP', assetScale: 9, relation: 'child' })
    await alice.$relatedQuery<Rule>('rules', db.knex()).insert({ name: 'errorHandler' })
    await alice.$relatedQuery<Rule>('rules', db.knex()).insert({ name: 'balance', config: { name: 'balance', minimum: '0', maximum: '100', initialBalance: '10' } })
    await alice.$relatedQuery<Protocol>('protocols', db.knex()).insert({ name: 'ildcp' })
    await alice.$relatedQuery<Endpoint>('endpoint', db.knex()).insert({ type: 'http', options: { peerUrl: 'http://localhost:8084/ilp' }})
    // load routes into db
    await Route.query(db.knex()).insertAndFetch({ peerId: 'alice', targetPrefix: 'test.other.rafiki.bob' })
  })

  after(async () => {
    await db.teardown()
  })

  beforeEach(async () => {
    app = new App(config, tokenAuthMiddleware(tokenService.introspect), db.knex())
    addPeerSpyForAppConstructor = sinon.spy(app, 'addPeer')
    await app.start()
    const koaApp = new Koa()
    const router = createRouter()
    router.route({
      method: 'post',
      path: '/ilp',
      handler: async (ctx: Koa.Context) => {
        ctx.set('content-type', 'application/octet-stream')
        ctx.body = serializeIlpFulfill(aliceResponse)
      }
    })
    koaApp.use(router.middleware())
    aliceServer = koaApp.listen(8084)
    mockSEServer = getLocal()
    mockSEServer.start(4000)
    await new Promise(resolve => setTimeout(() => resolve(), 100)) // give servers chance to start listening
  })

  afterEach(() => {
    app.shutdown()
    aliceServer.close()
    mockSEServer.stop()
    addPeerSpyForAppConstructor.restore()
  })

  it('can send a packet and receive reply from self', async function() {
    const ilpPrepare: IlpPrepare = {
      amount: '1',
      data: Buffer.from(''),
      destination: 'test.harry.alice',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(Date.now() + 34000)
    }

    const { data } = await Axios.post('http://localhost:8083/ilp', serializeIlpPrepare(ilpPrepare), { headers: { 'Authorization': 'Bearer aliceToken' }, responseType: 'arraybuffer' })
    const result = deserializeIlpReply(data)

    assert.deepEqual(result, {
      data: Buffer.from(''),
      fulfillment: Buffer.alloc(32)
    })
  })

  describe('start', function () {
    it('loads routes from db', async () => {
      const routes = app._connector._routingTable.getRoutingTable()

      assert.deepEqual(routes.get('test.other.rafiki.bob'), { nextHop: 'alice', path: [], weight: undefined, auth: undefined })
    })

    it('loads the peers from the database', async () => {
      const peerInfo =  addPeerSpyForAppConstructor.getCall(0).args[0]
      const endpointInfo =  addPeerSpyForAppConstructor.getCall(0).args[1]

      assert.deepEqual(peerInfo, {
        id: 'alice',
        assetCode: 'XRP',
        assetScale: 9,
        relation: 'child',
        rules: [
          { name: 'errorHandler' },
          { name: 'balance', minimum: '0', maximum: '100', initialBalance: '10'}
        ],
        protocols: [
          { name: 'ildcp' }
        ]
      })
      assert.deepEqual(endpointInfo, {
        type: 'http',
        httpOpts: { peerUrl: 'http://localhost:8084/ilp' }
      })
    })
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
      const removePeerSpy = sinon.spy(app._connector, 'removePeer')

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
      const addPeerStub = sinon.stub(app._connector, 'addPeer').resolves()

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
      config.loadFromOpts({ httpServerPort: 8082 })
      const newDB = new DB()
      await newDB.setup()
      const newApp = new App(config, tokenAuthMiddleware(tokenService.introspect), newDB.knex())
      await newApp.start()
      const koaAppParent = new Koa()
      const router = createRouter()
      router.route({
        method: 'post',
        path: '/ilp',
        handler: async (ctx: Koa.Context) => {
          const ildcpResponse: IldcpResponse = {
            assetCode: 'USD',
            assetScale: 2,
            clientAddress: 'test.alice.fred'
          } 
          ctx.set('content-type', 'application/octet-stream')
          ctx.body = serializeIldcpResponse(ildcpResponse)
        }
      })
      koaAppParent.use(router.middleware())
      const parentServer = koaAppParent.listen(8085)
      
      assert.equal(newApp._connector.getOwnAddress(), 'unknown')

      await newApp.addPeer(parentInfo, parentEndpointInfo)
  
      assert.equal('test.alice.fred', newApp._connector.getOwnAddress())
      newApp.shutdown()
      parentServer.close()
      newDB.teardown()
    })

    it('inherits addresses from multiple parents', async function () {
      // parent 2 will have a higher relation weighting than parent 1. So when getOwnAdress is called, the address from parent 2 should be returned. But getOwnAddresses should return an array of addresses.
      const config = new Config()
      config.loadFromOpts({ httpServerPort: 8082 })
      const newDB = new DB()
      await newDB.setup()
      const newApp = new App(config, tokenAuthMiddleware(tokenService.introspect), newDB.knex())
      await newApp.start()
      const koaAppParent = new Koa()
      const router = createRouter()
      router.route({
        method: 'post',
        path: '/ilp',
        handler: async (ctx: Koa.Context) => {
          const ildcpResponse: IldcpResponse = {
            assetCode: 'USD',
            assetScale: 2,
            clientAddress: 'test.alice.fred'
          } 
          ctx.set('content-type', 'application/octet-stream')
          ctx.body = serializeIldcpResponse(ildcpResponse)
        }
      })
      koaAppParent.use(router.middleware())
      const koaAppParent2 = new Koa()
      const router2 = createRouter()
      router2.route({
        method: 'post',
        path: '/ilp',
        handler: async (ctx: Koa.Context) => {
          const ildcpResponse: IldcpResponse = {
            assetCode: 'USD',
            assetScale: 2,
            clientAddress: 'test.drew.fred'
          } 
          ctx.set('content-type', 'application/octet-stream')
          ctx.body = serializeIldcpResponse(ildcpResponse)
        }
      })
      koaAppParent2.use(router2.middleware())
      const parentServer = koaAppParent.listen(8085)
      const parent2Server = koaAppParent2.listen(8086)
      
      assert.equal(newApp._connector.getOwnAddress(), 'unknown')
  
      await newApp.addPeer(parentInfo, parentEndpointInfo)
      await newApp.addPeer(parent2Info, parent2EndpointInfo)
  
      assert.equal(newApp._connector.getOwnAddress(), 'test.drew.fred')
      assert.deepEqual(newApp._connector.getOwnAddresses(), ['test.drew.fred', 'test.alice.fred'])
      newApp.shutdown()
      parentServer.close()
      parent2Server.close()
      newDB.teardown()
    })

    it('persists peer and endpoint info to db if store is set to true', async () => {
      let peers = await Peer.query(db.knex())
      assert.notInclude(peers.map(peer => peer.id), 'bob')
      const bobInfo: PeerInfo = {
        id: 'bob',
        assetCode: 'XRP',
        assetScale: 9,
        relation: 'peer',
        rules: [{
          name: 'balance',
          minimum: '0',
          maximum: '100'
        }],
        protocols: [{
          name: 'ildcp',
          testData: 'test'
        }]
      }
      const bobEndpointInfo = {
        type: 'http',
        httpOpts: {
          peerUrl: 'http://localhost:8087'
        }
      }

      await app.addPeer(bobInfo, bobEndpointInfo, true)

      peers = await Peer.query(db.knex()).where('id', 'bob').eager('[rules,protocols,endpoint]')
      const bob = peers[0]
      assert.equal(bobInfo.id, bob.id)
      assert.equal(bobInfo.assetCode, bob.assetCode)
      assert.equal(bobInfo.assetScale, bob.assetScale)
      assert.equal(bobInfo.relation, bob.relation)
      assert.equal('balance', bob['rules'][0]['name'])
      assert.deepEqual({name: 'balance', minimum: '0', maximum: '100'}, bob['rules'][0]['config'])
      assert.equal('ildcp', bob['protocols'][0]['name'])
      assert.deepEqual({ name: 'ildcp', testData: 'test' }, bob['protocols'][0]['config'])
      assert.equal(bobEndpointInfo.type, bob['endpoint']['type'])
      assert.deepEqual(bobEndpointInfo.httpOpts, bob['endpoint']['options'])
      // clean up for other tests
      await app.removePeer('bob', true)
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

    it('removes the peer from the database if store is set to true', async () => {
      const jerryInfo: PeerInfo = {
        id: 'jerry',
        assetCode: 'XRP',
        assetScale: 9,
        relation: 'peer',
        rules: [{
          name: 'errorHandler'
        }],
        protocols: [{
          name: 'ildcp'
        }]
      }
      const bobEndpointInfo = {
        type: 'http',
        httpOpts: {
          peerUrl: 'http://localhost:8087'
        }
      }
      await app.addPeer(jerryInfo, bobEndpointInfo, true)
      assert.equal((await Peer.query(db.knex()).where('id', 'jerry')).length, 1)

      await app.removePeer('jerry', true)

      assert.isEmpty(await Peer.query(db.knex()).where('id', 'jerry'))
      assert.isEmpty(await Rule.query(db.knex()).where('peerId', 'jerry'))
      assert.isEmpty(await Protocol.query(db.knex()).where('peerId', 'jerry'))
      assert.isEmpty(await Endpoint.query(db.knex()).where('peerId', 'jerry'))
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
          balance: '10',
          minimum: '0',
          maximum: '100'
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
      const connectorSendOutgoingRequestSpy = sinon.spy(app._connector, 'sendOutgoingRequest')
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
      assert.notInclude(app._connector._routingTable.getRoutingTable()['prefixes'], 'test.alice')

      app.addRoute('test.alice', 'alice')

      assert.include(app._connector._routingTable.getRoutingTable()['prefixes'], 'test.alice')
    })

    it('throws error if specified peer does not exist', async function () {
      assert.throws(() => {
        app.addRoute('test.unknown.peer', 'unknownPeer')
      }, 'Cannot add route for unknown peerId=unknownPeer')
    })
  })

})
