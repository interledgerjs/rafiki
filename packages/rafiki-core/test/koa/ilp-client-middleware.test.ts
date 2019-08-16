import { Context } from 'koa'
import {createClientController} from '../../src/controllers/client'
import {AppServicesFactory} from '../factories/app-services'
import {PeerInfoFactory} from '../factories/peerInfo'
import assert from 'http-assert'

describe('ILP Client Middleware', () => {
  test('Throws if context has no outgoing peer on context state', async () => {
    const ctx = {
      state: {
        peers: {
          outgoing: undefined
        }
      },
      assert
    } as Context
    const services = AppServicesFactory.build()

    const middleware = createClientController(services)

    await expect(middleware(ctx)).rejects.toThrow()
  })

  test('Throws if client services does not return a client', async () => {
    const ctx = {
      state: {
        peers: {
          outgoing: PeerInfoFactory.build()
        }
      },
      assert
    } as Context
    const services = AppServicesFactory.build()

    const middleware = createClientController(services)

    await expect(middleware(ctx)).rejects.toThrow()
  })

  test('Calls client to send ILP packet if client found and binds result to ilp rawRes', async () => {
    const ctx = {
      state: {
        peers: {
          outgoing: PeerInfoFactory.build()
        },
        ilp: {
          outgoingRawReq: Buffer.from('req')
        }
      },
      assert
    } as Context
    const services = AppServicesFactory.build({
      clients: {
        get: (id: string) => {
          expect(id).toStrictEqual(ctx.state.peers.outgoing.id)
          return {
            send: (buffer: Buffer) => {
              expect(buffer).toStrictEqual(Buffer.from('req'))
              return Buffer.from('res')
            }
          }
        }
      }
    })

    const middleware = createClientController(services)

    await middleware(ctx)
    expect(ctx.state.ilp.rawRes).toStrictEqual(Buffer.from('res'))
  })
})


