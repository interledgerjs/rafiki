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
}).catch(console.error)

const router = new InMemoryRouter(peers, {
  globalPrefix: 'test',
  ilpAddress: 'test.bob'
})

// Define a custom auth function
const auth: RafikiMiddleware = async (ctx: RafikiContext, next: () => Promise<any>) => {
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

// Create custom logging middleware that will raise events when it is called
const logger: RafikiMiddleware = async (ctx: RafikiContext, next: () => Promise<any>) => {
  ctx.log = {
    fatal: (...args: any[]) => ctx.app.emit('fatal', ...args),
    error: (...args: any[]) => ctx.app.emit('error', ...args),
    warn: (...args: any[]) => ctx.app.emit('warning', ...args),
    info: (...args: any[]) => ctx.app.emit('info', ...args),
    debug: (...args: any[]) => ctx.app.emit('debug', ...args),
    trace: (...args: any[]) => ctx.app.emit('trace', ...args)
  }
  await next()
}
// Create Rafiki and set out to look for alice and bob peers
const app = createApp({ auth, peers, router, logger })

// Bind to log events emitted by our custom logger
app.on('fatal', (...args: any[]) => {
  console.error(args)
  process.exit(1)
})
app.on('error', console.error)
app.on('warn', console.error)
app.on('info', console.log)
app.on('debug', console.log)
app.on('trace', console.log)

app.listen(3000, () => app.emit('info', 'Listening on port 3000'))
