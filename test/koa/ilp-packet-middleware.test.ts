import { Context } from 'koa'
import { ilpPacketMiddleware } from "../../src/koa/ilp-packet-middleware"
import { IlpPrepareFactory } from '../factories/ilpPacket'

test('Koa: ILP Packet Middleware', async () => {
  const prepare = IlpPrepareFactory.build()
  const ctx = {
    state: {}
  } as Context
  const next = jest.fn().mockImplementation(() => {
    expect(ctx).toMatchSnapshot()
  })
  const middleware = ilpPacketMiddleware()

  await expect(middleware(ctx, next)).resolves.toBeUndefined()

  expect(next).toHaveBeenCalledTimes(1)
  expect(ctx).toMatchSnapshot()

})
