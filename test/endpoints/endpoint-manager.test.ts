import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { EndpointManager, EndpointInfo } from '../../src/endpoints'
import { PluginEndpoint } from '../../src'
import BtpPlugin from 'ilp-plugin-btp'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Endpoint Manager', function () {
  
  let endpointManager: EndpointManager

  beforeEach(function () {
    endpointManager = new EndpointManager({})
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
      await btpClient.connect()

      assert.instanceOf(pluginEndpoint, PluginEndpoint)
      await endpointManager.closeEndpoints('bob')
      await btpClient.disconnect()
    })
  })
})