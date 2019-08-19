import {
  createApp,
  InMemoryPeers,
  InMemoryAccountsService,
  InMemoryRouter,
  RafikiRouter,
  createIncomingBalanceMiddleware,
  createOutgoingBalanceMiddleware,
  createIncomingErrorHandlerMiddleware,
  createIldcpProtocolController, createCcpProtocolController, createOutgoingExpireMiddleware, createClientController
} from '@interledger/rafiki-core'
import {
  createIncomingMaxPacketAmountMiddleware,
  createIncomingRateLimitMiddleware,
  createIncomingReduceExpiryMiddleware,
  createIncomingThroughputMiddleware,
  createOutgoingReduceExpiryMiddleware,
  createOutgoingThroughputMiddleware,
  createOutgoingValidateFulfillmentMiddleware
} from '@interledger/rafiki-middleware'
import compose = require('koa-compose')
import { AdminApi } from '@interledger/rafiki-admin-api'

const peerService = new InMemoryPeers()
const accountsService = new InMemoryAccountsService(peerService)
const router = new InMemoryRouter(peerService, {
  globalPrefix: 'test',
  ilpAddress: 'test.alice'
})

const adminApi = new AdminApi({ host: '0.0.0.0', port: 3001 }, {
  auth: () => Promise.resolve('test'),
  peers: peerService,
  accounts: accountsService,
  router: router
})

const incoming = compose([
  // Incoming Rules
  createIncomingErrorHandlerMiddleware(),
  createIncomingMaxPacketAmountMiddleware(),
  createIncomingRateLimitMiddleware(),
  createIncomingThroughputMiddleware(),
  createIncomingReduceExpiryMiddleware(),
  createIncomingBalanceMiddleware()
])

const outgoing = compose([
    // Outgoing Rules
  createOutgoingBalanceMiddleware(),
  createOutgoingThroughputMiddleware(),
  createOutgoingReduceExpiryMiddleware(),
  createOutgoingExpireMiddleware(),
  createOutgoingValidateFulfillmentMiddleware(),

    // Send outgoing packets
  createClientController()
])

const middleware = compose([incoming, outgoing])

// TODO Add auth
const app = createApp({
  peers: peerService,
  router: router,
  accounts: accountsService
})

const appRouter = new RafikiRouter()

// Default ILP routes
// TODO Understand the priority and workings of the router... Seems to do funky stuff. Maybe worth just writing ILP one?
appRouter.ilpRoute('test.*', middleware)
appRouter.ilpRoute('peer.config', createIldcpProtocolController())
appRouter.ilpRoute('peer.route.*', createCcpProtocolController())
// TODO Handle echo

app.use(appRouter.routes())

app.on('info', console.log)
app.on('error', console.error)

app.listen(3000)
adminApi.listen()
