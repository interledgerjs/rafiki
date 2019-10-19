import BtpPlugin from 'ilp-plugin-btp'
import Koa from 'koa'
import {
  deserializeIlpReply,
  serializeIlpPrepare,
  serializeIlpReply
} from 'ilp-packet'
import got from 'got'
import { Server } from '../src/server'

describe('btp-relay', () => {
  it('can send a packet that gets forwarded and waits for the reply', async () => {
    const koa = new Koa()
    koa.use(async ctx => {
      await new Promise(resolve => setTimeout(resolve, 200))
      ctx.body = serializeIlpReply({
        fulfillment: Buffer.alloc(32),
        data: Buffer.from('secret_data')
      })
    })
    const httpServer = koa.listen(3030)
    const server = new Server()
    const client = new BtpPlugin({
      server: 'btp+ws://:shh_its_a_secret@localhost:8080'
    })

    await server.listen()
    await client.connect()

    const response = await client.sendData(
      serializeIlpPrepare({
        destination: 'test',
        amount: '1',
        data: Buffer.from(''),
        executionCondition: Buffer.alloc(32),
        expiresAt: new Date()
      })
    )

    const packet = deserializeIlpReply(response)
    expect(packet).toEqual({
      fulfillment: Buffer.alloc(32),
      data: Buffer.from('secret_data')
    })

    await httpServer.close()
    await client.disconnect()
    await server.close()
  })

  it('can send http request to', async () => {
    const koa = new Koa()
    koa.use(async ctx => {
      await new Promise(resolve => setTimeout(resolve, 200))
      ctx.body = serializeIlpReply({
        fulfillment: Buffer.alloc(32),
        data: Buffer.from('secret_data')
      })
    })
    const httpServer = koa.listen(3030)
    const server = new Server()
    const client = new BtpPlugin({
      server: 'btp+ws://:shh_its_a_secret@localhost:8080'
    })
    client.registerDataHandler(async data => {
      console.log('got data', data)
      return serializeIlpReply({
        fulfillment: Buffer.alloc(32),
        data: Buffer.from('secret_data')
      })
    })

    await server.listen()
    await client.connect()

    const prepare = serializeIlpPrepare({
      destination: 'test',
      amount: '1',
      data: Buffer.from(''),
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date()
    })

    const response = await got
      .post('http://localhost:3031', {
        headers: {
          'content-type': 'application/octet-stream'
        },
        body: prepare
      })
      .then((response: any) => Buffer.from(response.body))

    const packet = deserializeIlpReply(response)
    expect(packet).toEqual({
      fulfillment: Buffer.alloc(32),
      data: Buffer.from('secret_data')
    })

    await httpServer.close()
    await client.disconnect()
    await server.close()
  })
})
