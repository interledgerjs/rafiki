import { createApp, RafikiContext, InMemoryPeers } from '@interledger/rafiki-core'
import pino from 'koa-pino-logger'
import { serializers } from '@interledger/rafiki-logger-pino'

// Setup minimum required setup
const peers = new InMemoryPeers()
peers.add({
  id: 'alice',
  relation: 'child',
  defaultAccountId : 'test',
  isCcpReceiver: false,
  isCcpSender: false
}).catch(console.error)

// Create Rafiki and set out to look for alice an bob peers
const app = createApp({
  peers
})

app.use(pino({ serializers }))
app.use(async (ctx: RafikiContext, next: () => Promise<any>) => {
  ctx.log.warn('Changing amount')
  ctx.request.prepare.amount = '999'
  await next()
})
app.use((ctx: RafikiContext) => {
  ctx.response.fulfill = {
    fulfillment: Buffer.alloc(32),
    data: Buffer.alloc(0)
  }
})

app.listen(3000)
