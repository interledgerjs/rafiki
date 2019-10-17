import { createContext } from '@interledger/rafiki-utils'
import { RafikiContext } from '../../src/rafiki'
import {
  PeerFactory,
  IlpPrepareFactory,
  RafikiServicesFactory
} from '../../src/factories'
import { createClientController } from '../../src/controllers/client'
import { ZeroCopyIlpPrepare } from '../../src/middleware/ilp-packet'

describe('Client Controller', function () {
  const alice = PeerFactory.build({ id: 'alice' })
  const bob = PeerFactory.build({ id: 'bob' })
  const services = RafikiServicesFactory.build()
  const ctx = createContext<any, RafikiContext>()
  ctx.services = services
  ctx.peers = {
    get incoming () {
      return Promise.resolve(alice)
    },
    get outgoing () {
      return Promise.resolve(bob)
    }
  }
  const controller = createClientController()

  test('sends packet to outgoing client', async () => {
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(controller(ctx)).resolves.toBeUndefined()

    expect(bob.send).toHaveBeenCalled()
    expect(ctx.response.rawReply).toBeDefined()
  })
})
