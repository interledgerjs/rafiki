#!/usr/bin/env node

import * as winston from 'winston'
import { App } from './app'
import { AdminApi } from './services/admin-api'
import { SettlementAdminApi } from './services/settlement-admin-api/settlement-admin-api'
import { Config } from './index'

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

const config = new Config()
const app = new App(config)
const adminApi = new AdminApi({ host: config.adminApiHost, port: config.adminApiPort }, { app })
const settlementAdminApi = new SettlementAdminApi({ host: config.settlementAdminApiHost, port: config.settlementAdminApiPort }, { getAccountBalance: app.getBalance.bind(app), updateAccountBalance: app.updateBalance.bind(app) })

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

  config.loadFromEnv()
  await app.start()
  adminApi.listen()
  settlementAdminApi.listen()

  // load peers from config
  Object.keys(config.peers || {}).forEach(peer => app.addPeer(config.peers[peer], config.peers[peer]['endpoint']))
}
if (!module.parent) {
  start().catch(e => {
    const errInfo = (e && typeof e === 'object' && e.stack) ? e.stack : e
    winston.error(errInfo)
  })
}
