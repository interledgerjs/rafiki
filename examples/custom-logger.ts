import {
  Config,
  RafikiContext,
  getBearerToken,
  InMemoryPeers,
  InMemoryConnector,
  createApp,
  RafikiMiddleware, ClientConfig, BalanceConfig
} from '../src'

// Can choose where you configs are loaded
const config = new Config()
config.loadFromEnv()

// Setup minimum required setup
const peers = new InMemoryPeers()
peers.add({
  id: 'alice',
  assetCode: 'XRP',
  assetScale: 9,
  relation: 'child',
  client: {} as ClientConfig,
  balance: {} as BalanceConfig,
  rules: {},
  protocols: {}
})
const connector = new InMemoryConnector(peers, {
  globalPrefix: 'test',
  ilpAddress: config.ilpAddress
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
  console.log(ctx.state.ilp.req)
  console.log(await ctx.state.peers.incoming)
  await next()
}

// Create Rafiki and set out to look for alice an bob peers
const app = createApp(config, {
  auth: authMiddleware,
  peers,
  connector
}, customMiddlewareLogger)

app.listen(3000)
