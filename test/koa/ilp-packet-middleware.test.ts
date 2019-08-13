import { Context } from 'koa'
import { ilpPacketMiddleware, IlpState } from "../../src/koa/ilp-packet-middleware"
import { IlpPrepareFactory, IlpFulfillFactory } from '../factories/ilpPacket'
import { AppServicesFactory } from '../factories/app-services'
import { DB } from '../helpers/db'
import { Readable } from 'stream'
import { serializeIlpPrepare, serializeIlpFulfill, deserializeIlpPrepare } from 'ilp-packet'
import { createContext } from '../../src/koa/create-context';
import { PeerState } from '../../src/koa/peer-middleware';

describe('Koa: ILP Packet Middleware', () => {

  const db = new DB()
  const services = AppServicesFactory.build(null, { knex: db.knex() })

  beforeAll(async () => {
    await db.setup()
  })

  afterAll(async () => {
    await db.teardown()
  })

  it('attaches the ilp object to the context state', async () => {
    const prepare = IlpPrepareFactory.build()
    const ctx = createContext<IlpState & PeerState>({ req: { headers: { 'content-type': 'application/octet-stream' } } })
    const getRawBody = async (req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn()
    const middleware = ilpPacketMiddleware(services, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.state).toHaveProperty('ilp')
    expect(Object.keys(ctx.state.ilp)).toEqual(['req', 'rawReq', 'res', 'rawRes', 'outgoingAmount', 'outgoingExpiry', 'outgoingRawReq', 'incomingRawRes'])
  })

  it('calls next', async () => {
    const prepare = IlpPrepareFactory.build()
    const ctx = createContext<IlpState & PeerState>({ req: { headers: { 'content-type': 'application/octet-stream' } } })
    const getRawBody = async (req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn()
    const middleware = ilpPacketMiddleware(services, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
  })

  it.skip('sets the response type to application/octet-stream', async () => {
    // TODO figure out why test is failing
    const prepare = IlpPrepareFactory.build()
    const ctx = createContext<IlpState & PeerState>({ req: { headers: { 'content-type': 'application/octet-stream' } } })
    const getRawBody = async (req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn()
    const middleware = ilpPacketMiddleware(services, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.type).toBe('application/octet-stream')
  })

  it('sets the response body to the rawRes', async () => {
    const prepare = IlpPrepareFactory.build()
    const ctx = createContext<IlpState & PeerState>({ req: { headers: { 'content-type': 'application/octet-stream' } } })
    const rawFulfill = serializeIlpFulfill(IlpFulfillFactory.build())
    const getRawBody = async (req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.state.ilp.rawRes = rawFulfill
    })
    const middleware = ilpPacketMiddleware(services, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.body).toEqual(rawFulfill)
  })

  it('updates the outgoing request amount if amount has changed', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '10' })
    const ctx = createContext<IlpState & PeerState>({ req: { headers: { 'content-type': 'application/octet-stream' } } })
    const getRawBody = async (req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.state.ilp.outgoingAmount = 5n
    })
    const middleware = ilpPacketMiddleware(services, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const outgoingRequest = deserializeIlpPrepare(ctx.state.ilp.outgoingRawReq)
    expect(outgoingRequest.amount).toEqual('5')
  })

  it('updates the outgoing request expiry if expiry has changed', async () => {
    const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT
    const prepare = IlpPrepareFactory.build({ amount: '10', expiresAt: new Date(START_DATE) })
    const ctx = createContext<IlpState & PeerState>({ req: { headers: { 'content-type': 'application/octet-stream' } } })
    const getRawBody = async (req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.state.ilp.outgoingExpiry = new Date(START_DATE + 10 * 1000)
    })
    const middleware = ilpPacketMiddleware(services, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const outgoingRequest = deserializeIlpPrepare(ctx.state.ilp.outgoingRawReq)
    expect(outgoingRequest.expiresAt).toEqual(new Date(START_DATE + 10 * 1000))
  })
})
