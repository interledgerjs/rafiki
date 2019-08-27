import {
  InMemoryPeers,
  InMemoryAccountsService,
  InMemoryRouter,
  RafikiRouter,
  createIncomingBalanceMiddleware,
  createOutgoingBalanceMiddleware,
  createIncomingErrorHandlerMiddleware,
  createIldcpProtocolController, createCcpProtocolController, createOutgoingExpireMiddleware, TokenInfo, Rafiki, createAuthMiddleware
} from '@interledger/rafiki-core'
import {
  createIncomingMaxPacketAmountMiddleware,
  createIncomingRateLimitMiddleware,
  createIncomingThroughputMiddleware,
  createOutgoingReduceExpiryMiddleware,
  createOutgoingThroughputMiddleware,
  createOutgoingValidateFulfillmentMiddleware
} from '@interledger/rafiki-middleware'
import compose = require('koa-compose')
import { createFulfillClientController } from './fulfillClientController'
import pino from 'koa-pino-logger'
import { serializers } from '@interledger/rafiki-logger-pino'

const VUS = parseInt(process.env.VUS || '1000')

const peerService = new InMemoryPeers()
const accountsService = new InMemoryAccountsService()
const router = new InMemoryRouter(peerService, {
  globalPrefix: 'test',
  ilpAddress: 'test.connector'
})

const incoming = compose([
  // Incoming Rules
  createIncomingErrorHandlerMiddleware(),
  createIncomingMaxPacketAmountMiddleware(),
  createIncomingRateLimitMiddleware(),
  createIncomingThroughputMiddleware()
  // createIncomingBalanceMiddleware()
])

const outgoing = compose([
    // Outgoing Rules
  // createOutgoingBalanceMiddleware(),
  createOutgoingThroughputMiddleware(),
  createOutgoingReduceExpiryMiddleware(),
  createOutgoingExpireMiddleware(),
  createOutgoingValidateFulfillmentMiddleware(),

  // Custom client that returns a fulfill packet where the fulfillment is the condition from the incoming prepare packet
  createFulfillClientController()
])

const middleware = compose([incoming, outgoing])
// custom auth to allow all tokens
const authenticate = (token: TokenInfo): boolean => true
// custom introspection to return peerId that matches VU id
const introspect = async (token: string): Promise<TokenInfo> => {
  const peerId = padRightString(token)
  return {
    active: true,
    sub: peerId
  }
}

const app = new Rafiki({
  peers: peerService,
  router: router,
  accounts: accountsService
})

// health endpoint for dockerize to wait for
app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    return ctx.body = 'ok'
  }

  await next()
})

app.use(createAuthMiddleware({ authenticate, introspect }))
app.useIlp()

const appRouter = new RafikiRouter()

// Default ILP routes
// TODO Understand the priority and workings of the router... Seems to do funky stuff. Maybe worth just writing ILP one?
appRouter.ilpRoute('test.*', middleware)
appRouter.ilpRoute('peer.config', createIldcpProtocolController())
appRouter.ilpRoute('peer.route.*', createCcpProtocolController())

app.use(appRouter.routes())

app.on('info', console.log)
app.on('error', console.error)

function padRightString (str: string, length: number = 5) {
  if (str.length > length) {
    throw new Error(`Cannot pad string. String length: ${str.length}. Required length: ${length}.`)
  }
  const lengthDiff = length - str.length
  let paddedStr = str
  for (let i = 0; i < lengthDiff; i++) {
    paddedStr += 'x'
  }
  return paddedStr
}

async function run () {
  for (let i = 1; i < VUS + 1; i++) {
    console.log('adding peer', padRightString(i.toString()))
    await peerService.add({
      id: padRightString(i.toString()),
      relation: 'child',
      defaultAccountId : 'test',
      isCcpReceiver: false,
      isCcpSender: false
    })
  }
  app.listen(3000, () => console.log('Rafiki is listening on port 3000'))
}

run().catch(console.error)
