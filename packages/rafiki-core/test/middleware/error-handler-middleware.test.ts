import { createContext } from '@interledger/rafiki-utils'
import { RafikiContext } from '../../src/rafiki'
import { Logger } from '../../src/types'
import { TestLoggerFactory } from '../factories/test-logger'
import { createIncomingErrorHandlerMiddleware } from '../../src/middleware/error-handler'
import { InMemoryPeers } from '../../src/services';
import { PeerInfoFactory } from '../factories/peerInfo'
import { RafikiServicesFactory } from '../factories/rafiki-services'
import { SELF_PEER_ID } from '../../src/constants'

describe('Error Handler Middleware', () => {

  const peers = new InMemoryPeers()
  const selfPeer = PeerInfoFactory.build({ id: SELF_PEER_ID })
  const services = RafikiServicesFactory.build({}, { peers })

  beforeAll(async () => {
    await peers.add(selfPeer)
  })

  test('catches errors and converts into ilp reject', async () => {
    const ctx = createContext<any, RafikiContext>();
    (ctx.log as Logger) = TestLoggerFactory.build()
    const errorToBeThrown = new Error('Test Error')
    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    ctx.services = services
    const middleware = createIncomingErrorHandlerMiddleware()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.log.error).toHaveBeenCalledWith('Error thrown in incoming pipeline', { err: errorToBeThrown })
  })

  test('sets triggeredBy to own address if error is thrown in next', async () => {
    const ctx = createContext<any, RafikiContext>();
    (ctx.log as Logger) = TestLoggerFactory.build()
    const errorToBeThrown = new Error('Test Error')
    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    ctx.services = services
    const middleware = createIncomingErrorHandlerMiddleware()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.response.reject!.triggeredBy).toEqual('unknown.self')
  })

  test('creates reject if reply is not set in next', async () => {
    const ctx = createContext<any, RafikiContext>();
    (ctx.log as Logger) = TestLoggerFactory.build()
    const next = jest.fn().mockImplementation(() => {
      // don't set reply
    })
    ctx.services = services
    const middleware = createIncomingErrorHandlerMiddleware()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.log.error).toHaveBeenCalledWith('handler did not return a valid value.')
  })
})
