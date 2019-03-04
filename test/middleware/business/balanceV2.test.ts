import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpReject, IlpFulfill } from 'ilp-packet';
import { PeerInfo } from '../../../src/types/peer';
import { BalanceV2Middleware } from '../../../src/middleware/business/balanceV2'
import Stats from '../../../src/services/stats';
import { setPipelineReader } from '../../../src/types/middleware';
import * as RedisIo from 'ioredis';
const Redis = require('ioredis-mock');

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

const eventToJson = (event: Array<string>) => {
  let json = {}
  for (let i=0; i < event.length; i = i + 2) {
    json[event[i]] = event[i+1]
  }
  return json
}

describe('BalanceV2 Middleware', function () {
    let balanceMiddleware: BalanceV2Middleware
    let redis: RedisIo.Redis
    const peerInfo: PeerInfo = {
      id: 'harry',
      relation: 'peer',
      assetScale: 9,
      assetCode: 'XRP'
    }

    beforeEach( async function () {
      redis =  new Redis()
      balanceMiddleware = new BalanceV2Middleware({ peerInfo, redisInstance: redis})
    })
    
    describe('instantiation', function () {

    })

    describe('incoming packets', function () {
      
      it('successful packet sends prepare event and fulfill event to stream', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const fulfillPacket: IlpFulfill = {
          fulfillment: Buffer.from(''),
          data: Buffer.from('')
        }
        
        const sendIncoming = setPipelineReader('incoming', balanceMiddleware, async () => fulfillPacket)

        await sendIncoming(preparePacket)
        await redis.xrange('balance', '0', '99999999999999').then((event: Array<Array<Array<string>>>) => {
          assert.equal(event.length, 2)

          const prepareEvent = eventToJson(event[0][1])
          assert.deepEqual(prepareEvent, {
            peerId: 'harry',
            type: 'prepare',
            amount: '49',
            pipeline: 'incoming'
          })

          const fulfillEvent = eventToJson(event[1][1])
          assert.deepEqual(fulfillEvent, {
            peerId: 'harry',
            type: 'fulfill',
            amount: '49',
            pipeline: 'incoming'
          })

        })
      })

      it('failed packet sends fail event to stream', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const fulfillPacket: IlpFulfill = {
          fulfillment: Buffer.from(''),
          data: Buffer.from('')
        }
        
        const sendIncoming = setPipelineReader('incoming', balanceMiddleware, async () => {throw new Error('')} )

        try {
          await sendIncoming(preparePacket)
        } catch(error) {

        }
        await redis.xrange('balance', '0', '99999999999999').then((event: Array<Array<Array<string>>>) => {
          assert.equal(event.length, 2)

          const failedEvent = eventToJson(event[1][1])
          assert.deepEqual(failedEvent, {
            peerId: 'harry',
            type: 'failed',
            amount: '49',
            pipeline: 'incoming'
          })
        })
      })

      it('reject packet sends reject event to stream', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const rejectPacket: IlpReject = {
          code: 'T01',
          data: Buffer.from(''),
          message: 'failed',
          triggeredBy: 'test.harry'
        }      
        const sendIncoming = setPipelineReader('incoming', balanceMiddleware, async () => rejectPacket )
  
        await sendIncoming(preparePacket)
  
        await redis.xrange('balance', '0', '99999999999999').then((event: Array<Array<Array<string>>>) => {
          assert.equal(event.length, 2)

          const rejectEvent = eventToJson(event[1][1])
          assert.deepEqual(rejectEvent, {
            peerId: 'harry',
            type: 'reject',
            amount: '49',
            pipeline: 'incoming'
          })
        })
      })
    })

    describe('outgoing packets', function() {
      
      it('successful fulfill sends fulfill event to stream', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const fulfillPacket: IlpFulfill = {
          fulfillment: Buffer.from(''),
          data: Buffer.from('')
        }
        
        const sendOutgoing = setPipelineReader('outgoing', balanceMiddleware, async () => fulfillPacket)

        await sendOutgoing(preparePacket)
        await redis.xrange('balance', '0', '99999999999999').then((event: Array<Array<Array<string>>>) => {
          assert.equal(event.length, 2)

          const prepareEvent = eventToJson(event[0][1])
          assert.deepEqual(prepareEvent, {
            peerId: 'harry',
            type: 'prepare',
            amount: '49',
            pipeline: 'outgoing'
          })

          const fulfillEvent = eventToJson(event[1][1])
          assert.deepEqual(fulfillEvent, {
            peerId: 'harry',
            type: 'fulfill',
            amount: '49',
            pipeline: 'outgoing'
          })
        })
      })

      it('failed packet sends fail event to stream', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const fulfillPacket: IlpFulfill = {
          fulfillment: Buffer.from(''),
          data: Buffer.from('')
        }
        
        const sendOutgoing = setPipelineReader('outgoing', balanceMiddleware, async () => {throw new Error('')} )

        try {
          await sendOutgoing(preparePacket)
        } catch(error) {

        }
        await redis.xrange('balance', '0', '99999999999999').then((event: Array<Array<Array<string>>>) => {
          assert.equal(event.length, 2)

          const failedEvent = eventToJson(event[1][1])
          assert.deepEqual(failedEvent, {
            peerId: 'harry',
            type: 'failed',
            amount: '49',
            pipeline: 'outgoing'
          })
        })
      })

      it('reject packet sends reject event to stream', async function () {
        const preparePacket: IlpPrepare = {
          amount: '49',
          executionCondition: Buffer.from('uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=', 'base64'),
          expiresAt: new Date(START_DATE + 2000),
          destination: 'mock.test1',
          data: Buffer.alloc(0)
        }
        const rejectPacket: IlpReject = {
          code: 'T01',
          data: Buffer.from(''),
          message: 'failed',
          triggeredBy: 'test.harry'
        }      
        const sendOutgoing = setPipelineReader('incoming', balanceMiddleware, async () => rejectPacket )
  
        await sendOutgoing(preparePacket)
  
        await redis.xrange('balance', '0', '99999999999999').then((event: Array<Array<Array<string>>>) => {
          assert.equal(event.length, 2)

          const rejectEvent = eventToJson(event[1][1])
          assert.deepEqual(rejectEvent, {
            peerId: 'harry',
            type: 'reject',
            amount: '49',
            pipeline: 'incoming'
          })
        })
      })

    })
})
