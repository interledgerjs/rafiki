import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import BtpPlugin from 'ilp-plugin-btp';
import { PluginEndpoint } from '../../src/legacy/plugin-endpoint';
import { PluginInstance } from '../../src/legacy/plugin';
import App from '../../src/app';
import { IlpPrepare, serializeIlpFulfill, IlpFulfill, deserializeIlpPacket, serializeIlpPrepare, deserializeIlpFulfill } from 'ilp-packet';
import { randomBytes, createHash } from 'crypto';
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

function sha256 (preimage: Buffer) { return createHash('sha256').update(preimage).digest() }
const fulfillment = randomBytes(32)
const condition = sha256(fulfillment)

describe('Peer Integration', function () {
  let app1: App
  let app2: App
  let btpServer: BtpPlugin
  let btpClient: BtpPlugin
  let btpServerLegacyEndpoint: PluginEndpoint
  let btpClientLegacyEndpoint: PluginEndpoint

  beforeEach( async function () {
    btpServer = new BtpPlugin({
      listener: {
        port: 9000,
        secret: 'shh_its_a_secret'
      }
    })
    btpClient = new BtpPlugin({
      server: 'btp+ws://:shh_its_a_secret@localhost:9000'
    })

    await Promise.all([
      btpServer.connect(),
      btpClient.connect()
    ])

    btpServerLegacyEndpoint = new PluginEndpoint((btpServer as unknown) as PluginInstance)
    btpClientLegacyEndpoint = new PluginEndpoint((btpClient as unknown) as PluginInstance)

    app1 = new App({
      env: 'test',
      accounts: {
        'bob-ledger': {
          relation: 'peer',
          assetCode: 'CAD',
          assetScale: 4,
          endpoint: btpServerLegacyEndpoint,
          options: {},
          sendRoutes: true,
          receiveRoutes:true
        }
      },
      ilpAddress: 'g.app1'
    })

    app2 = new App({
      env: 'test',
      accounts: {
        'alice-ledger': {
          relation: 'peer',
          assetCode: 'CAD',
          assetScale: 4,
          endpoint: btpClientLegacyEndpoint,
          options: {},
          sendRoutes: true,
          receiveRoutes:true
        }
      },
      ilpAddress: 'g.app2'
    })
  })

  afterEach(async function () {
    if(app1) app1.shutdown()
    if(app2) app2.shutdown()
    await Promise.all([
      btpServer.disconnect(),
      btpClient.disconnect()
    ])
  })

  it('peering sends route updates to each other', async function() {
    assert.deepEqual(app1.connector.routingTable.getRoutingTable().keys(), ['g.app1'])
    assert.deepEqual(app2.connector.routingTable.getRoutingTable().keys(), ['g.app2'])

    await Promise.all([
      app1.start(),
      app2.start(),
    ])

    //Wait to see if the routing tables get updated
    await new Promise((resolve) => setTimeout(resolve, 1000))

    assert.deepEqual(app1.connector.routingTable.getRoutingTable().keys(), ['g.app2', 'g.app1'])
    assert.deepEqual(app2.connector.routingTable.getRoutingTable().keys(), ['g.app2', 'g.app1'])
  })
})