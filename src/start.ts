#!/usr/bin/env node

import * as winston from 'winston'
import Knex from 'knex'
import { AdminApi } from './services'
import { SettlementAdminApi } from './services/settlement-admin-api/settlement-admin-api'
import { tokenAuthMiddleware } from './koa/token-auth-middleware'
import { Config } from './index'
import { serializeIlpPrepare, deserializeIlpReply, isReject } from 'ilp-packet'
import { STATIC_CONDITION } from './constants'
import { InMemoryPeers } from './services/peers/in-memory'
import { InMemoryConnector } from './services/connector/in-memory'
import { createApp } from './rafiki'
import { RemoteTokenService } from './services/tokens/remote'
import { KnexTokenService } from './services/tokens/knex'
import { Server } from 'net'

// Logging
// tslint:disable-next-line
const stringify = (value: any) => typeof value === 'bigint' ? value.toString() : JSON.stringify(value)
const formatter = winston.format.printf(({ service, level, message, component, timestamp, ...metaData }) => {
  return `${timestamp} [${service}${component ? '-' + component : ''}] ${level}: ${message}` + (metaData ? ' meta data: ' + stringify(metaData) : '')
})

winston.configure({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.align(),
    formatter
  ),
  defaultMeta: { service: 'rafiki' },
  transports: [
    new winston.transports.Console()
  ]
})

// Load config from ENV vars
const config = new Config()
config.loadFromEnv()

// Connect to DB
const knex = Knex(config.databaseConnectionString)

// Remote vs Local token auth
const tokens = config.authProviderUrl !== '' ? new RemoteTokenService(config.authProviderUrl) : new KnexTokenService(knex)
const peers = new InMemoryPeers()
const connector = new InMemoryConnector(peers, config.env === 'production' ? 'g' : 'test')

// Create Rafiki
const app = createApp(config, {
  auth: { introspect: tokens.introspect },
  peers,
  connector
})

// Create Admin API
const adminApi = new AdminApi({
  host: config.adminApiHost,
  port: config.adminApiPort
}, {
  tokens,
  middleware:  (config.adminApiAuth) ? tokenAuthMiddleware(tokens.introspect, token => { return token.sub === 'self' }) : undefined
})

// Create Settlement API
const settlementAdminApi = new SettlementAdminApi({
  host: config.settlementAdminApiHost,
  port: config.settlementAdminApiPort
}, {
  getAccountBalance: (id: string) => peers.getOrThrow(id).balance.toJSON() ,
  updateAccountBalance: (id: string, amountDiff: bigint, scale: number) => {
    const balance = peers.getOrThrow(id).balance
    const scaleDiff = balance.scale - scale
    // TODO: update to check whether scaledAmountDiff is an integer
    if (scaleDiff < 0) {
      // TODO: should probably throw an error
      // logger.warn('Could not adjust balance due to scale differences', { amountDiff, scale })
      return
    }
    const scaleRatio = Math.pow(10, scaleDiff)
    const scaledAmountDiff = amountDiff * BigInt(scaleRatio)
    balance.adjust(scaledAmountDiff)
  },
  sendMessage: async (id: string, message: Buffer) => {
    const packet = serializeIlpPrepare({
      amount: '0',
      destination: 'peer.settle',
      executionCondition: STATIC_CONDITION,
      expiresAt: new Date(Date.now() + 60000),
      data: message
    })

    const ilpReply = deserializeIlpReply(await peers.getOrThrow(id).client.send(packet))

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

  await peers.load(knex)
  await connector.load(knex)

  // config loads ilpAddress as 'unknown' by default
  if (config.ilpAddress && config.ilpAddress !== 'unknown') {
    connector.addOwnAddress(config.ilpAddress)
  }
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
