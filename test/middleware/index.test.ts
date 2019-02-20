import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare } from 'ilp-packet';
import { setPipelineReader, Middleware, IlpRequestHandler } from '../../src/types/middleware';

describe('Middleware', function () {
    let counter: number
    let middleware: Middleware

    beforeEach( async function () {
      counter = 0
      middleware = new Middleware({
        processIncoming: async (request: IlpPrepare, next: IlpRequestHandler) => {
          counter++
          return next(request)
        },
        processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler) => {
          counter--
          return next(request)
        }
      })

    })

    it('adds process function to incoming pipeline', async function () {
      const sendIncoming = setPipelineReader('incoming', middleware, async () => {
        return {
          fulfillment: Buffer.alloc(0),
          data: Buffer.alloc(0)
        }
      })
      await sendIncoming({
        amount: '100',
        destination: 'test',
        executionCondition: Buffer.alloc(0),
        expiresAt: new Date(),
        data: Buffer.alloc(0)
      })
      assert.equal(counter, 1)
    })

    it('adds process function to outgoing pipeline', async function () {
      const sendOutgoing = setPipelineReader('outgoing', middleware, async () => {
        return {
          fulfillment: Buffer.alloc(0),
          data: Buffer.alloc(0)
        }
      })
      await sendOutgoing({
        amount: '100',
        destination: 'test',
        executionCondition: Buffer.alloc(0),
        expiresAt: new Date(),
        data: Buffer.alloc(0)
      })
      assert.equal(counter, -1)
    })

})