#!/usr/bin/env node

import * as winston from 'winston'
import Knex from 'knex'
import { App } from './app'
import { RemoteTokenService } from './services'
import { authenticate } from './koa/token-auth-middleware'
import { WalletConfig as Config } from './index'
import { PeerInfo } from './types'

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
  defaultMeta: { service: 'rafiki-wallet' },
  transports: [
    new winston.transports.Console()
  ]
})

// Load config from ENV vars
const config = new Config()
config.loadFromEnv()

// Use remote token service
const tokenService = new RemoteTokenService(config.authProviderUrl)

// Create Rafiki that will send all incoming ilp-over-http requests to the "open" client
const knex = Knex(':memory:')
const app = new App(config, authenticate(tokenService, token => { return token.sub === 'open' }), knex) // token will point all connections to the "open" peer

// define pipeline for uplink
const uplinkProtocols = [
  { 'name': 'ildcp' }
]
const uplinkRules = [
  { 'name': 'errorHandler' },
  { 'name': 'validateFulfillment' },
  { 'name': 'reduceExpiry' },
  { 'name': 'expire' }
]
const uplinkInfo: PeerInfo = {
  id: 'uplink',
  assetCode: config.assetCode,
  assetScale: config.assetScale,
  protocols: uplinkProtocols,
  rules: uplinkRules,
  relation: 'parent'
}

// define "open" pipeline to handle all incoming ilp-over-http requests. Middleware will talk to wallet and agreement services.
const openProtocols = [
  { 'name': 'ildcp' }
]
const openRules = [
  { 'name': 'errorHandler' }
  // { 'name': 'walletBalance' },
  // { 'name': 'agreementBalance' }
]
const openInfo: PeerInfo = {
  id: 'open',
  assetCode: 'XRP',
  assetScale: 9,
  protocols: openProtocols,
  rules: openRules,
  relation: 'child'
}
export const gracefulShutdown = async () => {
  winston.debug('shutting down.')
  await app.close()
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

  await knex.migrate.latest()
  await app.addPeer(openInfo, { type: 'http', httpOpts: {} }) // currently can only receive ilp requests
  await app.addPeer(uplinkInfo, { type: 'http', httpOpts: { peerUrl: config.uplinkUrl, peerAuthToken: config.uplinkAuthToken } })

  await app.listen()
  winston.info('🐒 has 🚀. Get ready for 🍌🍌🍌🍌🍌')
}
if (!module.parent) {
  start().catch(e => {
    const errInfo = (e && typeof e === 'object' && e.stack) ? e.stack : e
    winston.error(errInfo)
  })
}
