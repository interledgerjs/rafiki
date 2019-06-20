#!/usr/bin/env node

import * as winston from 'winston'
import { App } from './app'
import { AdminApi } from './services/admin-api'
import { SettlementEngine } from './services/settlement-engine'
import Redis from 'ioredis'
import { Config } from './index'

// Logging
// tslint:disable-next-line
const stringify = (value: any) => typeof value === 'bigint' ? value.toString() : JSON.stringify(value)
const formatter = winston.format.printf(({ service, level, message, component, timestamp, ...metaData }) => {
  return `${timestamp} [${service}${component ? '-' + component : ''}] ${level}: ${message}` + (metaData ? ' meta data: ' + stringify(metaData) : '')
})

const SETTLEMENT_BALANCE_STREAM_KEY = process.env.SETTLEMENT_BALANCE_STREAM_KEY || 'balance'
const SETTLEMENT_REDIS_HOST = process.env.SETTLEMENT_REDIS_HOST || '0.0.0.0'
const SETTLEMENT_REDIS_PORT = Number(process.env.SETTLEMENT_REDIS_PORT) || 6379

winston.configure({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.align(),
    formatter
  ),
  defaultMeta: { service: 'connector' },
  transports: [
    new winston.transports.Console()
  ]
})

const start = async () => {

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
      winston.debug('shutting down.')
      await app.shutdown()
      adminApi.shutdown()
      winston.debug('completed graceful shutdown.')
      process.exit(0)
    } catch (err) {
      const errInfo = (err && typeof err === 'object' && err.stack) ? err.stack : err
      winston.error('error while shutting down. error=%s', errInfo)
      process.exit(1)
    }
  })

  const config = new Config()
  config.loadFromEnv()
  const app = new App(config)
  const settlementEngine = new SettlementEngine({ streamKey: SETTLEMENT_BALANCE_STREAM_KEY, redisClient:  new Redis({ host: SETTLEMENT_REDIS_HOST, port: SETTLEMENT_REDIS_PORT }) })
  const adminApi = new AdminApi({ host: config.adminApiHost, port: config.adminApiPort }, { app, settlementEngine })

  await app.start()
  adminApi.listen()

  // load peers from config
  Object.keys(config.peers || {}).forEach(peer => app.addPeer(config.peers[peer], config.peers[peer]['endpoint']))

  // load pre-configured routes. Must be done after the pre-configured peers have been loaded.
  const routes: {targetPrefix: string, peerId: string}[] = config['routes'] || []
  routes.forEach(entry => app.addRoute(entry.targetPrefix, entry.peerId))
}
if (!module.parent) {
  start().catch(e => {
    const errInfo = (e && typeof e === 'object' && e.stack) ? e.stack : e
    winston.error(errInfo)
  })
}
