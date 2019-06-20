import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { EndpointManager, EndpointInfo } from '../../src/endpoints'
import { PluginEndpoint } from '../../src'
import BtpPlugin from 'ilp-plugin-btp'
import { createServer, Http2Server, connect, ClientHttp2Session } from 'http2'
import { IlpFulfill, IlpPrepare, serializeIlpPrepare } from 'ilp-packet';
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Endpoint Manager', function () {
  
  let endpointManager: EndpointManager
  let server: Http2Server
  let client: ClientHttp2Session

  beforeEach(async () => {
    server = createServer()
    endpointManager = new EndpointManager({
      http2Server: server,
      authService: (token: string) => Promise.resolve('bob')
    })
    await server.listen(6969)
    client = connect('http://127.0.0.1:6969')
  })

  afterEach(async () => {
    await server.close()
    await client.close()
  })

  describe('createEndpoint', function () {
    it('can create a plugin endpoint using ilp-plugin-btp', async function () {
      const btpClient = new BtpPlugin({
        server: 'btp+ws://:secret@localhost:9000'
      })
      const pluginEndpointInfo: EndpointInfo = {
        type: 'plugin',
        pluginOpts: {
          name: 'ilp-plugin-btp',
          opts: {
            listener: {
              port: 9000,
              secret: 'secret'
            }
          }
        }
      }

      const pluginEndpoint = endpointManager.createEndpoint('bob', pluginEndpointInfo)
      await Promise.all([
        btpClient.connect(),
        (pluginEndpoint as PluginEndpoint).connect()
      ])

      assert.instanceOf(pluginEndpoint, PluginEndpoint)
      await endpointManager.closeEndpoints('bob')
      await btpClient.disconnect()
    })
  })

  describe('http2 endpoint manager', function() {
    
    it('can create a http2 endpoint using auth', async function () {
      return new Promise(async (resolve) => {
        const req = client.request({ ':path': '/ilp', ':method': "POST", 'Authorization': 'Bearer myawesometoken' })
        const pluginEndpoint = endpointManager.createEndpoint('bob', {
          'type': 'http',
          'url': 'http://test.local/'
        })
  
        pluginEndpoint.setIncomingRequestHandler((packet) => {
          resolve()
          return Promise.resolve({
            data: Buffer.from(''),
            fulfillment: Buffer.alloc(32)
          } as IlpFulfill)
        })
  
        const IlpPrepare: IlpPrepare = {
          amount: '1',
          executionCondition: Buffer.alloc(32),
          expiresAt: new Date(),
          data: Buffer.from(''),
          destination: 'g.test'
        }
  
        const data = await req.end(serializeIlpPrepare(IlpPrepare))
      })
    })
  })
})