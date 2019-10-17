import { createContext } from '@interledger/rafiki-utils'
import { RafikiContext } from '../../src/rafiki'
import { PeerInfoFactory, RafikiServicesFactory } from '../../src/factories'
import { createIncomingErrorHandlerMiddleware } from '../../src/middleware/error-handler'
import { SELF_PEER_ID } from '../../src/constants'
import { InMemoryPeers } from '../../src/services'

describe('Error Handler Middleware', () => {
  const peers = new InMemoryPeers()
  const selfPeer = PeerInfoFactory.build({ id: SELF_PEER_ID })
  const services = RafikiServicesFactory.build({}, { peers })

  beforeAll(async () => {
    await peers.add(selfPeer)
  })

  test('catches errors and converts into ilp reject', async () => {
    const ctx = createContext<any, RafikiContext>()
    const errorToBeThrown = new Error('Test Error')
    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    ctx.services = services
    const middleware = createIncomingErrorHandlerMiddleware()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.services.logger.error).toHaveBeenCalledWith(
      'Error thrown in incoming pipeline',
      { err: errorToBeThrown }
    )
  })

  test('sets triggeredBy to own address if error is thrown in next', async () => {
    const ctx = createContext<any, RafikiContext>()
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
    const ctx = createContext<any, RafikiContext>()
    const next = jest.fn().mockImplementation(() => {
      // don't set reply
    })
    ctx.services = services
    const middleware = createIncomingErrorHandlerMiddleware()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.services.logger.error).toHaveBeenCalledWith(
      'handler did not return a valid value.'
    )
  })
})
