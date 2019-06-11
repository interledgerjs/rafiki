import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { App, PeerInfo, EndpointInfo } from '../../src'
import { Mockttp, getLocal } from 'mockttp'
import { Config } from '../../src';

const assert = Object.assign(Chai.assert, sinon.assert)

describe('Connector and settlement engine linking', function () {
  let rafiki1: App
  let rafiki2: App
  let mockSeServer: Mockttp
  const aliceInfo: PeerInfo = {
    id: 'alice',
    assetCode: 'XRP',
    assetScale: 6,
    protocols: [{
      "name": "ildcp"
    },
    {
      "name": "ccp",
      "sendRoutes": true,
      "receiveRoutes": true
    }],
    rules: [
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
        "name": 'balance' 
      }
    ],
    relation: 'peer',
    settlement: {
      ledgerAddress: 'rxalice',
      url: 'http://localhost:4000'
    }
  }
  const aliceEndpointInfo: EndpointInfo = {
    type: 'http',
    url: 'http://localhost:8083/ilp/bob'
  }
  const bobInfo: PeerInfo = {
    id: 'bob',
    assetCode: 'XRP',
    assetScale: 6,
    protocols: [{
      "name": "ildcp"
    },
    {
      "name": "ccp",
      "sendRoutes": true,
      "receiveRoutes": true
    }],
    rules: [
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
        "name": 'balance' 
      }
    ],
    relation: 'peer',
    settlement: {
      ledgerAddress: 'rxbob',
      url: 'http://localhost:4001'
    }
  }
  const bobEndpointInfo: EndpointInfo = {
    type: 'http',
    url: 'http://localhost:8084/ilp/alice'
  }
  const config1 = new Config()
  config1.loadFromOpts({ ilpAddress: 'test.alice', http2ServerPort: 8083, peers: {} })
  const config2 = new Config()
  config2.loadFromOpts({ ilpAddress: 'test.bob', http2ServerPort: 8084, peers: {} })

  beforeEach(async () => {
    rafiki1 = new App(config1)
    await rafiki1.addPeer(bobInfo, bobEndpointInfo)
    rafiki2 = new App(config2)
    await rafiki2.addPeer(aliceInfo, aliceEndpointInfo)
    await rafiki1.start()
    await rafiki2.start()
    mockSeServer = getLocal()
    mockSeServer.start(4000)
  })

  afterEach(async () => {
    rafiki1.shutdown()
    rafiki2.shutdown()
    mockSeServer.stop()
  })

  it('can send a message from one settlement engine to another', async function () {
    const mockEndpoint = await mockSeServer.post('/accounts/alice/messages').thenReply(200, Buffer.from(''))
    const settlementConfigMessage = {
      type: 'config',
      data: {
        xrpAddress: 'rxAlice'
      }
    }

    const response = await rafiki1.forwardSettlementMessage('bob', Buffer.from(JSON.stringify(settlementConfigMessage)))

    assert.deepEqual(response, Buffer.from(''))
    const requests = await mockEndpoint.getSeenRequests()
    assert.deepEqual(requests[0].body.json, settlementConfigMessage)
  })
})