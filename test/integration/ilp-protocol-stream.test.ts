import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { App, Config, PeerInfo, EndpointInfo } from '../../src'
const PluginHttp = require('ilp-plugin-http')
import { createConnection, Server, DataAndMoneyStream } from 'ilp-protocol-stream'
import crypto from 'crypto'
import { AuthService } from '../../src/services/auth'
import { DB } from '../helpers/db'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('ilp-protocol-stream using ilp-plugin-http', function () {
  let port1: number
  let port2: number
  let port3: number
  let port4: number
  let serverPlugin: any
  let clientPlugin: any
  let server: Server
  let amountReceived: number
  let rafiki: App
  let db: DB

  beforeEach(async function () {
    port1 = 5050
    port2 = 5051
    port3 = 5052
    port4 = 5053

    const serverPeerInfo: PeerInfo = {
      "id": "server",
      "assetCode": "XRP",
      "assetScale": 9,
      "relation": "child",
      "rules": [
        {
          "name": "errorHandler"
        },
        {
          "name": "validateFulfillment"
        },
        {
          "name": "stats"
        },
        {
          "name": "expire"
        },
        {
          "name": "reduceExpiry"
        },
        {
          "name": "stats"
        },
        {
          "name": "balance",
          "minimum": "-2000000000000",
          "maximum": "2000000000000"
        }
      ],
      "protocols": [
        {
          "name": "ildcp"
        }
      ]
    }
    const serverEndpointInfo: EndpointInfo = {
      "type": "plugin",
      "pluginOpts": {
        "name": "ilp-plugin-http",
        "opts": {
          "incoming": {
            secret: 'secret_number_two',
            port: port2
          },
          "outgoing": {
            secret: 'secret_number_one',
            url: 'http://localhost:' + port1
          }
        }
      }
    }
    const clientPeerInfo: PeerInfo = {
      "id": "client",
      "assetCode": "XRP",
      "assetScale": 9,
      "relation": "child",
      "rules": [
        {
          "name": "errorHandler"
        },
        {
          "name": "validateFulfillment"
        },
        {
          "name": "stats"
        },
        {
          "name": "expire"
        },
        {
          "name": "reduceExpiry"
        },
        {
          "name": "stats"
        },
        {
          "name": "balance",
          "minimum": "-2000000000000",
          "maximum": "2000000000000"
        }
      ],
      "protocols": [
        {
          "name": "ildcp"
        }
      ]      
    }
    const clientEndpointInfo: EndpointInfo = {
      "type": "plugin",
      "pluginOpts": {
        "name": "ilp-plugin-http",
        "opts": {
          "incoming": {
            secret: 'secret_number_three',
            port: port3
          },
          "outgoing": {
            secret: 'secret_number_four',
            url: 'http://localhost:' + port4
          }
        }
      }
    }
    process.env.CONNECTOR_ILP_ADDRESS = "test.rafiki"

    serverPlugin = new PluginHttp({
      incoming: {
        secret: 'secret_number_one',
        port: port1
      },
      outgoing: {
        secret: 'secret_number_two',
        url: 'http://localhost:' + port2
      }
    })

    clientPlugin = new PluginHttp({
      incoming: {
        secret: 'secret_number_four',
        port: port4
      },
      outgoing: {
        secret: 'secret_number_three',
        url: 'http://localhost:' + port3
      }
    })

    server = new Server({
      plugin: serverPlugin,
      serverSecret: crypto.randomBytes(32)
    })

    server.on('connection', conn => {
      conn.on('stream', (stream: DataAndMoneyStream) => {
        stream.setReceiveMax('100000000')

        stream.on('money', (amount) => {
          amountReceived = amount
        })
      })
    })

    db = new DB()
    await db.setup()
    const config = new Config()
    const authService = new AuthService(db.knex())
    config.loadFromEnv()
    rafiki = new App(config, authService.getPeerIdByToken.bind(authService), db.knex())
    await rafiki.start()
    await rafiki.addPeer(serverPeerInfo, serverEndpointInfo)
    await rafiki.addPeer(clientPeerInfo, clientEndpointInfo)
    await Promise.all([
      serverPlugin.connect(),
      clientPlugin.connect(),
      server.listen()
    ])
  })

  afterEach(async function () {
    await Promise.all([
      rafiki.shutdown(),
      clientPlugin.disconnect(),
      serverPlugin.disconnect(),
      db.teardown()
    ]) 
  })

  it('streams successfully', async function () {
    const connection = await createConnection({
      ...server.generateAddressAndSecret(),
      plugin: clientPlugin,
      slippage: 0.05
    })
    assert.isUndefined(amountReceived)

    try {
      const stream = connection.createStream()
      await stream.sendTotal('6000000', { timeout: 999999999 })
    } catch (error) {
      assert.fail('Did not stream money')
    }

    assert.equal(amountReceived, 6000000)
    await connection.end()   
  })

})