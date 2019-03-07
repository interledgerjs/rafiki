import * as winston from 'winston'
import App from './app'
import AdminApi from './services/admin-api'

// Logging
const formatter = winston.format.printf(({ service, level, message, component, timestamp }) => {
  return `${timestamp} [${service}${component ? '-' + component : ''}] ${level}: ${message}`
})

winston.configure({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    formatter,
    winston.format.colorize()
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

  const app = new App({
    ilpAddress: 'g.harry',
    port: 8443
  })
  const adminApi = new AdminApi({ app })
  await app.start()
  adminApi.listen()
}

start().catch(e => {
  const errInfo = (e && typeof e === 'object' && e.stack) ? e.stack : e
  winston.error(errInfo)
})
