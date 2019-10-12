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
  createIncomingThroughputMiddleware,
  createOutgoingReduceExpiryMiddleware,
  createOutgoingThroughputMiddleware,
  createOutgoingValidateFulfillmentMiddleware
} from '@interledger/rafiki-middleware'
import { AdminApi } from '@interledger/rafiki-admin-api'

import { config } from 'dotenv'
import { Server } from 'http'

import createLogger from 'pino'
import compose = require('koa-compose')
config()
const logger = createLogger()
logger.level = 'trace'
/**
 * Admin API Variables
 */
const ADMIN_API_HOST = process.env.ADMIN_API_HOST || '127.0.0.1'
const ADMIN_API_PORT = parseInt(process.env.ADMIN_API_PORT || '3001', 10)
// const ADMIN_API_AUTH_TOKEN = process.env.ADMIN_API_AUTH_TOKEN || '' // TODO

/**
 * Connector variables
 */
const PREFIX = process.env.PREFIX || 'test'
const ILP_ADDRESS = process.env.ILP_ADDRESS || undefined
const PORT = parseInt(process.env.PORT || '3000', 10)

const peerService = new InMemoryPeers()
const accountsService = new InMemoryAccountsService()
const router = new InMemoryRouter(peerService, {
  globalPrefix: PREFIX,
  ilpAddress: ILP_ADDRESS
})

const adminApi = new AdminApi({ host: ADMIN_API_HOST, port: ADMIN_API_PORT }, {
  auth: (): boolean => {
    return true
  },
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
appRouter.ilpRoute(`${PREFIX}.*`, middleware)
appRouter.ilpRoute('peer.config', createIldcpProtocolController())
appRouter.ilpRoute('peer.route.*', createCcpProtocolController())
// TODO Handle echo

app.use(appRouter.routes())

let server: Server

export const gracefulShutdown = async (): Promise<void> => {
  logger.info('shutting down.')
  adminApi.shutdown()
  if (server) {
    return new Promise((resolve, reject): void => {
      server.close((err?: Error) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }
}
export const start = async (): Promise<void> => {
  let shuttingDown = false
  process.on('SIGINT', async (): Promise<void> => {
    try {
      if (shuttingDown) {
        logger.warn('received second SIGINT during graceful shutdown, exiting forcefully.')
        process.exit(1)
        return
      }

      shuttingDown = true

      // Graceful shutdown
      await gracefulShutdown()
      logger.info('completed graceful shutdown.')
    } catch (err) {
      const errInfo = (err && typeof err === 'object' && err.stack) ? err.stack : err
      logger.error('error while shutting down. error=%s', errInfo)
      process.exit(1)
    }
  })

  logger.info('🚀 the 🐒')
  server = app.listen(PORT)
  adminApi.listen()
  logger.info('🐒 has 🚀. Get ready for 🍌🍌🍌🍌🍌')
}

// If this script is run directly, start the server
if (!module.parent) {
  start().catch(e => {
    const errInfo = (e && typeof e === 'object' && e.stack) ? e.stack : e
    logger.error(errInfo)
  })
}
