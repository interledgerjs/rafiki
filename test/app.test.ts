import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import App, { EndpointInfo } from '../src/app'
import mock = require('mock-require')
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

import { connect, ClientHttp2Session, constants, createServer, Http2Server, Http2ServerRequest, Http2ServerResponse } from  'http2'
import { IlpPrepare, serializeIlpPrepare, deserializeIlpReply, IlpFulfill, serializeIlpFulfill } from 'ilp-packet';
import { PeerInfo } from '../src/types/peer';

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
    rules: [],
    protocols: [],
  }

  beforeEach(async () => {
    app = new App({ilpAddress: 'test.harry', port: 8083})
    await app.start()
    await app.addPeer(peerInfo, {
      type: 'http',
      url: 'http://localhost:8084'
    } as EndpointInfo, ['errorHandler'])
    client = connect('http://localhost:8083')
    aliceServer = createServer((request: Http2ServerRequest, response: Http2ServerResponse) => {
      const responsePacket = {
        data: Buffer.from(''),
        fulfillment: Buffer.alloc(32)
      } as IlpFulfill
      response.end(serializeIlpFulfill(responsePacket))
    })
    aliceServer.listen(8084)
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

    const result = deserializeIlpReply(await post(client, '', serializeIlpPrepare(ilpPrepare)))

    assert.deepEqual(result, {
      data: Buffer.from(''),
      fulfillment: Buffer.alloc(32)
    })
  })

})