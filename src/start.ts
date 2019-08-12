#!/usr/bin/env node

import * as winston from 'winston'
import Knex from 'knex'
import { App } from './app'
import { AdminApi, KnexTokenService, RemoteTokenService } from './services'
import { SettlementAdminApi } from './services/settlement-admin-api/settlement-admin-api'
import { tokenAuthMiddleware } from './koa/token-auth-middleware'
import { Config } from './index'

let knex: Knex

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
knex = Knex(config.databaseConnectionString)

// Remote vs Local token auth
const tokenService = config.authProviderUrl !== '' ? new RemoteTokenService(config.authProviderUrl) : new KnexTokenService(knex)

// Create Rafiki
const app = new App(config, tokenAuthMiddleware(tokenService.introspect), knex)

// Create Admin API
const adminApi = new AdminApi({
  host: config.adminApiHost,
  port: config.adminApiPort
}, {
  app,
  tokenService,
  middleware:  (config.adminApiAuth) ? tokenAuthMiddleware(tokenService.introspect, token => { return token.sub === 'self' }) : undefined
})

// Create Settlement API
const settlementAdminApi = new SettlementAdminApi({
  host: config.settlementAdminApiHost,
  port: config.settlementAdminApiPort
}, {
  getAccountBalance: app.getBalance.bind(app),
  updateAccountBalance: app.updateBalance.bind(app),
  sendMessage: app.forwardSettlementMessage.bind(app)
})

export const gracefulShutdown = async () => {
  winston.debug('shutting down.')
  await app.shutdown()
  adminApi.shutdown()
  settlementAdminApi.shutdown()
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

  await app.start()
  adminApi.listen()
  settlementAdminApi.listen()
  winston.info('🐒 has 🚀. Get ready for 🍌🍌🍌🍌🍌')
}
if (!module.parent) {
  start().catch(e => {
    const errInfo = (e && typeof e === 'object' && e.stack) ? e.stack : e
    winston.error(errInfo)
  })
}
