#!/usr/bin/env node

// import * as winston from 'winston'
import Knex from 'knex'
import { Server } from 'net'
import { serializeIlpPrepare, deserializeIlpReply, isReject } from 'ilp-packet'

import { Config } from '.'
import { TokenInfo, sendToPeer } from './services'
import { SettlementAdminApi } from './servers/settlement-api'
import { STATIC_CONDITION } from './constants'
import { InMemoryPeers } from './services/peers/in-memory'
import { InMemoryRouter } from './services/router/in-memory'
import { createApp, RafikiContext } from './rafiki'
import { RemoteTokenService } from './services/tokens/remote'
import { KnexTokenService } from './services/tokens/knex'
import { AdminApi } from './servers'

// Logging
// tslint:disable-next-line
// const stringify = (value: any) => typeof value === 'bigint' ? value.toString() : JSON.stringify(value)
// const formatter = winston.format.printf(({ service, level, message, component, timestamp, ...metaData }) => {
//   return `${timestamp} [${service}${component ? '-' + component : ''}] ${level}: ${message}` + (metaData ? ' meta data: ' + stringify(metaData) : '')
// })

// winston.configure({
//   level: process.env.LOG_LEVEL || 'info',
//   format: winston.format.combine(
//     winston.format.colorize(),
//     winston.format.timestamp(),
//     winston.format.align(),
//     formatter
//   ),
//   defaultMeta: { service: 'rafiki' },
//   transports: [
//     new winston.transports.Console()
//   ]
// })
const winston = console

// Load config from ENV vars
const config = new Config()
config.loadFromEnv()

// Connect to DB
const knex = Knex(config.databaseConnectionString)

// Remote vs Local token auth
const tokens = config.authProviderUrl !== '' ? new RemoteTokenService(config.authProviderUrl) : new KnexTokenService(knex)
const peers = new InMemoryPeers()
const router = new InMemoryRouter(peers, {
  globalPrefix: config.env === 'production' ? 'g' : 'test',
  ilpAddress: config.ilpAddress
})

// Create Rafiki
const app = createApp(config, {
  auth: { introspect: tokens.introspect },
  peers,
  router
})

// Create Admin API
// TODO: Clean this up
const auth = (config.adminApiAuth)
  ? {
    introspect: tokens.introspect,
    authenticate: (token: TokenInfo) => { return token.sub === 'self' }
  }
  : async (ctx: RafikiContext, next: Function) => { await next() }

const adminApi = new AdminApi({
  host: config.adminApiHost,
  port: config.adminApiPort
}, {
  router,
  peers,
  auth
})

// Create Settlement API
const settlementAdminApi = new SettlementAdminApi({
  host: config.settlementAdminApiHost,
  port: config.settlementAdminApiPort
}, {
  updateAccountBalance: async (id: string, amountDiff: bigint, scale: number) => {
    const peer = await peers.get(id)
    const balance = await peer.balance
    const scaleDiff = peer.info.assetScale - scale

    // TODO: update to check whether scaledAmountDiff is an integer
    if (scaleDiff < 0) {
      // TODO: should probably throw an error
      // logger.warn('Could not adjust balance due to scale differences', { amountDiff, scale })
      return
    }
    const scaleRatio = Math.pow(10, scaleDiff)
    const scaledAmountDiff = amountDiff * BigInt(scaleRatio)

    const { maximum, minimum } = peer.info.balance
    await balance.adjust(scaledAmountDiff, minimum, maximum)
  },
  sendMessage: async (id: string, message: Buffer) => {
    const packet = serializeIlpPrepare({
      amount: '0',
      destination: 'peer.settle',
      executionCondition: STATIC_CONDITION,
      expiresAt: new Date(Date.now() + 60000),
      data: message
    })

    const ilpReply = deserializeIlpReply(await sendToPeer(id, packet, peers))

    if (isReject(ilpReply)) {
      throw new Error('IlpPacket to settlement engine was rejected')
    }

    return ilpReply.data
  }
})

let server: Server
export const gracefulShutdown = async () => {
  winston.debug('shutting down.')
  adminApi.shutdown()
  settlementAdminApi.shutdown()
  if (server) {
    return new Promise((resolve, reject) => {
      server.close((err?: Error) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }
  winston.debug('completed graceful shutdown.')
}
export const start = async () => {

  let shuttingDown = false
  process.on('SIGINT', async () => {
    try {
      if (shuttingDown) {
        winston.warn('received second SIGINT during graceful shutdown, exiting forcefully.')
        process.exit(1)
        return
      }

      shuttingDown = true

      // Graceful shutdown
      await gracefulShutdown()
      process.exit(0)
    } catch (err) {
      const errInfo = (err && typeof err === 'object' && err.stack) ? err.stack : err
      winston.error('error while shutting down. error=%s', errInfo)
      process.exit(1)
    }
  })

  if (knex.client.config.connection.filename === ':memory:') {
    await knex.migrate.latest()
  } else {
    const status = await knex.migrate.status().catch(error => {
      winston.error('Error getting migrations status.', { error })
      winston.info('Please ensure you run the migrations before starting Rafiki')
      process.exit(1)
    })
    if (status !== 0) {
      winston.error('You need to run the latest migrations before running Rafiki')
      process.exit(1)
    }
  }

  // Load services from persistent datastores
  await peers.load(knex)
  await router.load(knex)

  server = app.listen(config.httpServerPort)
  adminApi.listen()
  settlementAdminApi.listen()
  winston.info('🐒 has 🚀. Get ready for 🍌🍌🍌🍌🍌')
}

// If this script is run directly, start the server
if (!module.parent) {
  start().catch(e => {
    const errInfo = (e && typeof e === 'object' && e.stack) ? e.stack : e
    winston.error(errInfo)
  })
}
