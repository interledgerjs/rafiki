import createLogger from 'pino'
import got from 'got'
import Koa from 'koa'
import getRawBody from 'raw-body'
import { Server } from './server'
import { Connection } from './connection'
const logger = createLogger()
logger.level = 'trace'

export function createServer (): Server {
  const koa = new Koa()
  const connections = new Map<string, Connection>()

  koa.use(async ctx => {
    const buffer = await getRawBody(ctx.req)
    // Need a mapping mechanism to find the socket
    const connection = connections.get('shh_its_a_secret')
    if (connection) {
      ctx.body = await connection.send(buffer)
    }
  })

  koa.listen(3031)
  const server = new Server({
    authenticate: async (username, password): Promise<string> => {
      logger.info('Got username and password', { username, password })
      return 'shh_its_a_secret'
    }
  })

  server.on('connection', (connection: Connection) => {
    logger.info('got connection', { id: connection.id })

    connection.on('close', (code: number) => {
      logger.info('incoming connection closed. code=' + code)
    })

    connection.on('error', (err: Error) => {
      logger.debug('incoming connection error. error=', err)
    })

    connections.set(connection.id, connection)

    connection.registerDataHandle((data: Buffer) => {
      return got
        .post('http://localhost:3030', {
          headers: {
            'content-type': 'application/octet-stream'
          },
          body: data
        })
        .then((response: any) => Buffer.from(response.body))
    })
  })

  logger.info(`listening for connections on ${8080}`)
  return server
}
