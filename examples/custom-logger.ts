// Can choose where you configs are loaded
import { InMemoryPeers } from '../packages/rafiki-core/src/services/peers'
import { InMemoryRouter } from '../packages/rafiki-core/src/services/router'
import { createApp, getBearerToken, RafikiContext, RafikiMiddleware } from '../packages/rafiki-core/src'

// Setup minimum required setup
const peers = new InMemoryPeers()
peers.add({
  id: 'alice',
  relation: 'child',
  defaultAccountId : 'test',
  isCcpReceiver: false,
  isCcpSender: false
})

const ilpRouter = new InMemoryRouter(peers, {
  globalPrefix: 'test',
  ilpAddress: 'test.bob'
})

// Define a custom auth function
const authMiddleware: RafikiMiddleware = async (ctx: RafikiContext, next: () => Promise<any>) => {
  const token = getBearerToken(ctx)
  if (token === 'alice') {
    ctx.state.user = {
      active: true,
      sub: 'alice'
    }
  } else if (token === 'bob') {
    ctx.state.user = {
      active: true,
      sub: 'bob'
    }
  } else {
    throw new Error('cant auth token')
  }
  await next()
}

const customMiddlewareLogger: RafikiMiddleware = async (ctx: RafikiContext, next: () => Promise<any>) => {
  console.log(ctx.ilp.prepare)
  console.log(await ctx.state.peers.incoming)
  await next()
}

// Create Rafiki and set out to look for alice an bob peers
const app = createApp({
  auth: authMiddleware,
  peers,
  router: ilpRouter
}, customMiddlewareLogger)

app.listen(3000)
