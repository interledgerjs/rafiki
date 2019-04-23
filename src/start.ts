#!/usr/bin/env node

import * as winston from 'winston'
import { App } from './app'
import { AdminApi } from './services/admin-api'
import { SettlementAdminApi } from './services/settlement-admin-api/settlement-admin-api';

// Logging
const formatter = winston.format.printf(({ service, level, message, component, timestamp }) => {
  return `${timestamp} [${service}${component ? '-' + component : ''}] ${level}: ${message}`
})

const ILP_ADDRESS = process.env.ILP_ADDRESS || ''
const HTTP2_SERVER_PORT = Number(process.env.HTTP2_SERVER_PORT) || 8443

const ADMIN_API_HOST = process.env.ADMIN_API_HOST || '0.0.0.0'
const ADMIN_API_PORT = Number(process.env.ADMIN_API_PORT) || 7780

const SETTLEMENT_ADMIN_API_HOST = process.env.ADMIN_API_HOST || '127.0.0.1'
const SETTLEMENT_ADMIN_API_PORT = Number(process.env.ADMIN_API_PORT) || 7781

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
      settlementAdminApi.shutdown()
      winston.debug('completed graceful shutdown.')
      process.exit(0)
    } catch (err) {
      const errInfo = (err && typeof err === 'object' && err.stack) ? err.stack : err
      winston.error('error while shutting down. error=%s', errInfo)
      process.exit(1)
    }
  })

  const app = new App({
    ilpAddress: ILP_ADDRESS,
    http2Port: HTTP2_SERVER_PORT
  })
  const adminApi = new AdminApi({ host: ADMIN_API_HOST, port: ADMIN_API_PORT }, { app })
  const settlementAdminApi = new SettlementAdminApi({ host: SETTLEMENT_ADMIN_API_HOST, port: SETTLEMENT_ADMIN_API_PORT }, { getAccountBalance: app.getBalance.bind(app), updateAccountBalance: app.updateBalance.bind(app) })

  await app.start()
  adminApi.listen()
  settlementAdminApi.listen()
}
if (!module.parent) {
  start().catch(e => {
    const errInfo = (e && typeof e === 'object' && e.stack) ? e.stack : e
    winston.error(errInfo)
  })
}
