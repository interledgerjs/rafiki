import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import * as rafiki from '../../src/start'
import getPort from 'get-port'
const PluginHttp = require('ilp-plugin-http')
import { createConnection, Server, DataAndMoneyStream } from 'ilp-protocol-stream'
import crypto from 'crypto'

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

  beforeEach(async function () {
    port1 = await getPort()
    port2 = await getPort()
    port3 = await getPort()
    port4 = await getPort()

    const rafikiPeers = {
      "server": {
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
        ],
        "endpoint": {
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
      },
      "client": {
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
        ],
        "endpoint": {
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
      }
    }
    process.env.CONNECTOR_PEERS = JSON.stringify(rafikiPeers)
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

  })

  beforeEach(async function () {
    await rafiki.start()
    await Promise.all([
      serverPlugin.connect(),
      clientPlugin.connect(),
      server.listen()
    ])
  })

  afterEach(async function () {
    await Promise.all([
      rafiki.gracefulShutdown(),
      clientPlugin.disconnect(),
      serverPlugin.disconnect()
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
      console.log('error', error)
      assert.fail('Did not stream money')
    }

    assert.equal(amountReceived, 6000000)
    await connection.end()   
  })

})