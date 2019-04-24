import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { App } from '../src/app'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

import { connect, ClientHttp2Session, constants, createServer, Http2Server, Http2ServerRequest, Http2ServerResponse } from  'http2'
import { IlpPrepare, serializeIlpPrepare, deserializeIlpReply, IlpFulfill, serializeIlpFulfill } from 'ilp-packet';
import { PeerInfo } from '../src/types/peer';
import { ErrorHandlerRule } from '../src/rules/error-handler';
import { isEndpoint } from '../src/types/endpoint';
import { EndpointInfo } from '../src';

const post = (client: ClientHttp2Session, path: string, body: Buffer): Promise<Buffer> => new Promise((resolve, reject) => {
  const req = client.request({
      [constants.HTTP2_HEADER_SCHEME]: "http",
      [constants.HTTP2_HEADER_METHOD]: constants.HTTP2_METHOD_POST,
      [constants.HTTP2_HEADER_PATH]: `/${path}`
  })

  req.write(body)
  req.end()
  let chunks: Array<Buffer> = []
  req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
  })
  req.on('end', () => {
      resolve(Buffer.concat(chunks))
  })
  req.on('error', (error) => reject(error))
});

describe('Test App', function () {
  let client: ClientHttp2Session
  let aliceServer: Http2Server
  let app: App
  const peerInfo: PeerInfo = {
    id: 'alice',
    assetCode: 'XRP',
    assetScale: 9,
    relation: 'child',
    rules: [{
      name: 'errorHandler'
    }],
    protocols: [{
      name: 'ildcp'
    }],
    settlement: {
      url: 'http://test.settlement/ilp',
      ledgerAddress: 'r4SJQA3bXPBK6bMBwZeRhwGRemoRX7WjeM'
    }
  }

  const endpointInfo: EndpointInfo = {
    type: 'http',
    'url': 'http://localhost:1234'
  }

  beforeEach(async () => {
    app = new App({ilpAddress: 'test.harry', http2Port: 8083})
    await app.start()
    await app.addPeer(peerInfo, {
      type: 'http',
      url: 'http://localhost:8084'
    } as EndpointInfo)
    client = connect('http://localhost:8083')
    aliceServer = createServer((request: Http2ServerRequest, response: Http2ServerResponse) => {
      const responsePacket = {
        data: Buffer.from(''),
        fulfillment: Buffer.alloc(32)
      } as IlpFulfill
      response.end(serializeIlpFulfill(responsePacket))
    })
    aliceServer.listen(8084)

    await new Promise(resolve => setTimeout(() => resolve(), 100)) // give servers chance to start listening
  })

  afterEach(() => {
    app.shutdown()
    aliceServer.close()
    client.close()
  })

  it('can send a packet and receive reply from self', async function() {
    const ilpPrepare: IlpPrepare = {
      amount: '1',
      data: Buffer.from(''),
      destination: 'test.harry.alice',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(Date.now() + 34000)
    }

    const result = deserializeIlpReply(await post(client, 'ilp/alice', serializeIlpPrepare(ilpPrepare)))

    assert.deepEqual(result, {
      data: Buffer.from(''),
      fulfillment: Buffer.alloc(32)
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
        }],
        settlement: {
          url: 'http://test.settlement/ilp',
          ledgerAddress: 'r4SJQA3bXPBK6bMBwZeRhwGRemoRX7WjeM'
        }
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
        app.updateBalance('unknown', 100n)
      } catch (error) {
        assert.equal(error.message, 'Cannot find balance for peerId=unknown')
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
        }],
        settlement: {
          url: 'http://test.settlement/ilp',
          ledgerAddress: 'r4SJQA3bXPBK6bMBwZeRhwGRemoRX7WjeM'
        }
      }
      await app.addPeer(peerInfo, endpointInfo)

      app.updateBalance('drew', 100n)
      
      assert.deepEqual(app.getBalance('drew'), {
        balance: '100',
        minimum: '-10',
        maximum: '200'
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
        }],
        settlement: {
          url: 'http://test.settlement/ilp',
          ledgerAddress: 'r4SJQA3bXPBK6bMBwZeRhwGRemoRX7WjeM'
        }
      }
      await app.addPeer(peerInfo, endpointInfo)

      const balances = app.getBalances()

      assert.deepEqual(balances, {
        'drew': {
          balance: '0',
          minimum: '-10',
          maximum: '10'
        }
      })
    })
  })

})