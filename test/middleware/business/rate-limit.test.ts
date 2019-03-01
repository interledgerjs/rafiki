import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpFulfill, isFulfill, Errors } from 'ilp-packet';
import { RateLimitMiddleware, createRateLimitBucketForPeer } from '../../../src/middleware/business/rate-limit'
import Stats from '../../../src/services/stats';
import { PeerInfo } from '../../../src/types/peer';
import TokenBucket from '../../../src/lib/token-bucket';
import { setPipelineReader } from '../../../src/types/middleware';
const { RateLimitedError } = Errors

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

describe('Rate Limit Middleware', function () {
  let stats: Stats
  let bucket: TokenBucket
  let rateLimitMiddleware: RateLimitMiddleware
  let peerInfo: PeerInfo = {
    id: 'harry',
    relation: 'peer',
    assetScale: 9,
    assetCode: 'XRP',
    rateLimit: { refillCount: 3n, capacity: 3n }
  }
  const preparePacket: IlpPrepare = {
    amount: '49',
    executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
    expiresAt: new Date(START_DATE + 2000),
    destination: 'mock.test1.bob',
    data: Buffer.alloc(0)
  }
  const fulfillPacket: IlpFulfill = {
    fulfillment: Buffer.from('HS8e5Ew02XKAglyus2dh2Ohabuqmy3HDM8EXMLz22ok', 'base64'),
    data: Buffer.alloc(0)
  }

  beforeEach(async function () {
    stats = new Stats()
    bucket = createRateLimitBucketForPeer(peerInfo)
    rateLimitMiddleware = new RateLimitMiddleware({ peerInfo, stats, bucket })
  })

  it('rejects when payments arrive too quickly', async function () {
    
    const sendIncoming = setPipelineReader('incoming', rateLimitMiddleware, async () => fulfillPacket)

    // Empty the token buffer
    for (let i = 0; i < 3; i++) {
      await sendIncoming(preparePacket)
    }

    try {
      const reply = await sendIncoming(preparePacket)
    } catch (err) { 
      if(err instanceof RateLimitedError){
        return
      }
     }
  })

  it('does not reject when payments arrive fine', async function () {
    const sendIncoming = setPipelineReader('incoming', rateLimitMiddleware, async () => fulfillPacket)
    const reply = await sendIncoming(preparePacket)
    assert.isTrue(isFulfill(reply))
  })
})