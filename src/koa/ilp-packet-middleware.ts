/**
 * Parse ILP packets
 */
import { deserializeIlpPrepare, serializeIlpReply, IlpPrepare, IlpReply, deserializeIlpReply } from 'ilp-packet'
import { Readable } from 'stream'
import { RafikiContext } from '../rafiki';

const CONTENT_TYPE = 'application/octet-stream'

export interface IlpState {
  ilp: {
    req: IlpPrepare
    res?: IlpReply
    rawReq: Buffer
    rawRes?: Buffer
    outgoingAmount: bigint
    outgoingExpiry: Date
    readonly outgoingRawReq: Buffer
    readonly incomingRawRes: Buffer
  }
}

export interface IlpPacketMiddlewareOptions {
  getRawBody: (req: Readable) => Promise<Buffer>
}

/**
 *  1. Gets the raw body info a Buffer and stores in `ctx.state.requestPacket`
 *  2. Parses it as an ILP prepare and stores in `ctx.state.requestPacket`
 *  3. Looks for reply packet in `ctx.state.responsePacket`
 *  4. Serializes reply and stores in `ctx.body`
 *
 * @param ctx Koa context
 * @param next Next middleware context
 */
export function ilpPacketMiddleware ({ getRawBody }: IlpPacketMiddlewareOptions) {

  return async function ilpPacket (ctx: RafikiContext, next: () => Promise<any>) {

    ctx.assert(ctx.request.type === CONTENT_TYPE, 400, 'Expected Content-Type of ' + CONTENT_TYPE)

    const _rawReq = await getRawBody(ctx.req)
    const _req = deserializeIlpPrepare(_rawReq)
    let _res: IlpReply | undefined = undefined
    let _rawRes: Buffer | undefined = undefined
    let _amount: bigint | undefined = undefined
    let _expiry: Date | undefined = undefined

    ctx.state.ilp = {
      req: _req,
      rawReq: _rawReq,
      set res (reply: IlpReply | undefined) {
        _res = reply
      },
      get res () {
        if (_res) return _res
        if (_rawRes) _res = deserializeIlpReply(_rawRes)
        return _res
      },
      set rawRes (reply: Buffer | undefined) {
        _rawRes = reply
      },
      get rawRes () {
        if (_rawRes) return _rawRes
        if (_res) _rawRes = serializeIlpReply(_res)
        return _rawRes
      },

      get outgoingAmount () {
        if (_amount) return _amount
        return BigInt(_req.amount)
      },

      set outgoingAmount (value: bigint) {
        _amount = value
      },

      get outgoingExpiry () {
        if (_expiry) return _expiry
        return _req.expiresAt
      },

      set outgoingExpiry (value: Date) {
        _expiry = value
      },

      get outgoingRawReq () {
        // TODO Splice in new amount and expiry if dirty
        return _rawReq
      },

      get incomingRawRes () {
        // TODO Splice in new data if dirty
        if (_rawRes) return _rawRes
        if (_res) return serializeIlpReply(_res)
        throw new Error('no response data set')
      }
    }

    await next()

    ctx.response.type = CONTENT_TYPE
    ctx.body = ctx.state.ilp.rawRes
  }

}
