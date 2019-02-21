import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { IlpPrepare, IlpReply } from 'ilp-packet';
import { setPipelineReader, Middleware, IlpRequestHandler } from '../../src/types/middleware';
import { start } from 'repl';


class CustomMiddleware extends Middleware {

  protected _processIncoming = (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
    throw new Error('')
  }

}

describe('Middleware', function () {
    let counter: number
    const startSendStop = async (mw: Middleware) => {
      const sendIncoming = setPipelineReader('incoming', mw, async () => {
        return {
          fulfillment: Buffer.alloc(0),
          data: Buffer.alloc(0)
        }
      })
      const sendOutgoing = setPipelineReader('outgoing', mw, async () => {
        return {
          fulfillment: Buffer.alloc(0),
          data: Buffer.alloc(0)
        }
      })

      await mw.startup()
      await sendIncoming({
        amount: '100',
        destination: 'test',
        executionCondition: Buffer.alloc(0),
        expiresAt: new Date(),
        data: Buffer.alloc(0)
      })
      await sendOutgoing({
        amount: '100',
        destination: 'test',
        executionCondition: Buffer.alloc(0),
        expiresAt: new Date(),
        data: Buffer.alloc(0)
      })
      await mw.shutdown()

    }

    
    beforeEach( async function () {
      counter = 0
    })

    it('adds startup logic', async function () {
      assert.equal(counter, 0)
      const middleware = new Middleware({
        startup: async () => {
          counter = 100
        },
      })
      await startSendStop(middleware)
      assert.equal(counter, 100)
    })

    it('adds shutdown logic', async function () {
      assert.equal(counter, 0)
      const middleware = new Middleware({
        shutdown: async () => {
          counter = 999
        },
      })
      await startSendStop(middleware)
      assert.equal(counter, 999)
    })

    it('adds process function to incoming pipeline', async function () {
      assert.equal(counter, 0)
      const middleware = new Middleware({
        processIncoming: async (request: IlpPrepare, next: IlpRequestHandler) => {
          counter++
          return next(request)
        }
      })
      await startSendStop(middleware)
      assert.equal(counter, 1)
    })

    it('adds process function to outgoing pipeline', async function () {
      assert.equal(counter, 0)
      const middleware = new Middleware({
        processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler) => {
          counter++
          return next(request)
        }
      })
      await startSendStop(middleware)
      assert.equal(counter, 1)
    })

    it('adds incoming and outgoing processing', async function () {
      assert.equal(counter, 0)
      const middleware = new Middleware({
        processIncoming: async (request: IlpPrepare, next: IlpRequestHandler) => {
          counter++
          counter++
          return next(request)
        },
        processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler) => {
          counter--
          return next(request)
        }
      })
      await startSendStop(middleware)
      assert.equal(counter, 1)
    })

    it('adds startup/shutdown and incoming/outgoing processing', async function () {
      assert.equal(counter, 0)
      const middleware = new Middleware({
        startup: async () => {
          counter = 100
        },
        processIncoming: async (request: IlpPrepare, next: IlpRequestHandler) => {
          counter += 20
          return next(request)
        },
        processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler) => {
          counter--
          return next(request)
        },
        shutdown: async () => {
          counter -= 50
        },
      })
      await startSendStop(middleware)
      assert.equal(counter, 69)
    })

})