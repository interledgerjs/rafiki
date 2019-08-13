import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import {App, Config, EndpointInfo, PeerInfo} from '../../src'
import {getLocal, Mockttp} from 'mockttp'
import {DB} from '../helpers/db'

const assert = Object.assign(Chai.assert, sinon.assert)

describe('Connector and settlement engine linking', function () {
  let rafiki1: App
  let rafiki2: App
  let mockSe1Server: Mockttp
  let mockSe2Server: Mockttp
  let db1: DB
  let db2: DB
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
        "name": 'balance',
        "settlement": {
          "url": 'http://localhost:4000'
        }
      }
    ],
    relation: 'peer'
  }
  const aliceEndpointInfo: EndpointInfo = {
    type: 'http',
    httpOpts: {
      peerUrl: 'http://localhost:8083/ilp',
      peerAuthToken: 'bob'
    }
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
        "name": 'balance',
        "settlement": {
          "url": 'http://localhost:4001'
        }
      }
    ],
    relation: 'peer'
  }
  const bobEndpointInfo: EndpointInfo = {
    type: 'http',
    httpOpts: {
      peerUrl: 'http://localhost:8084/ilp',
      peerAuthToken: 'alice'
    }
  }
  const config1 = new Config()
  config1.loadFromOpts({ ilpAddress: 'test.alice', httpServerPort: 8083 })
  const config2 = new Config()
  config2.loadFromOpts({ ilpAddress: 'test.bob', httpServerPort: 8084 })

  beforeEach(async () => {
    db1 = new DB()
    db2 = new DB()
    await db1.setup()
    await db2.setup()
    mockSe1Server = getLocal()
    mockSe2Server = getLocal()
    await mockSe1Server.start(4000)
    await mockSe2Server.start(4001)
    await mockSe1Server.post('/accounts').thenReply(200)
    await mockSe2Server.post('/accounts').thenReply(200)
    rafiki1 = new App(config1, (string) => Promise.resolve('bob'), db1.knex())
    rafiki2 = new App(config2, (string) => Promise.resolve('alice'), db2.knex())    
    await rafiki1.listen()
    await rafiki2.listen()
    await rafiki1.addPeer(bobInfo, bobEndpointInfo)
    await rafiki2.addPeer(aliceInfo, aliceEndpointInfo)
  })

  afterEach(async () => {
    await mockSe1Server.delete('/accounts/alice').thenReply(200)
    await mockSe2Server.delete('/accounts/bob').thenReply(200)
    rafiki1.close()
    rafiki2.close()
    await new Promise(resolve => setTimeout(() => resolve(), 100)) //wait for delete account requests to reach mock se
    mockSe1Server.stop()
    mockSe2Server.stop()
    await db1.teardown()
    await db2.teardown()
  })

  it('can send a message from one settlement engine to another', async function () {
    const mockEndpoint = await mockSe1Server.post('/accounts/alice/messages').thenReply(200, Buffer.from(''))
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
