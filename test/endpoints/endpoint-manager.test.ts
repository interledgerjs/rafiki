import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {EndpointInfo, EndpointManager} from '../../src/endpoints'
import {PluginEndpoint} from '../../src'
import BtpPlugin from 'ilp-plugin-btp'
import {IlpFulfill, IlpPrepare, serializeIlpPrepare, deserializeIlpReply} from 'ilp-packet'
import { Server } from 'net'
import Koa from 'koa'
import Axios from 'axios';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Endpoint Manager', function () {
  
  let endpointManager: EndpointManager
  let server: Server
  let ilpOverHttpApp: Koa

  beforeEach(async () => {
    ilpOverHttpApp = new Koa()
    endpointManager = new EndpointManager({
      httpServer: ilpOverHttpApp,
      authService: (token: string) => Promise.resolve('bob')
    })
    server = await ilpOverHttpApp.listen(6969)
  })

  afterEach(async () => {
    await server.close()
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

  describe('http endpoint manager', function() {
    
    it('can create a http endpoint using auth', async function () {
      const fulfill: IlpFulfill = {
        data: Buffer.from(''),
        fulfillment: Buffer.alloc(32)
      }
      const pluginEndpoint = endpointManager.createEndpoint('bob', {
        type: 'http',
        httpOpts: {
          peerUrl: 'http://test.local/'
        }
      })

      pluginEndpoint.setIncomingRequestHandler((packet) => {
        return Promise.resolve(fulfill)
      })

      const IlpPrepare: IlpPrepare = {
        amount: '1',
        executionCondition: Buffer.alloc(32),
        expiresAt: new Date(),
        data: Buffer.from(''),
        destination: 'g.test'
      }

      const response = await Axios.post('http://localhost:6969/ilp', serializeIlpPrepare(IlpPrepare), { headers: { 'Authorization': 'Bearer myawesometoken' }, responseType: 'arraybuffer' })

      assert.deepEqual(deserializeIlpReply(response.data), fulfill)
    })
  })
})
