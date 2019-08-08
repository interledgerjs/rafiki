// A Koa ILP packet parser middleware
import { deserializeIlpPrepare, serializeIlpReply } from 'ilp-packet'
import getRawBody = require('raw-body')
import * as Koa from 'koa'

// TODO: If this becomes configurable then we should have a default export that returns a configured instanceof the parse function

const CONTENT_TYPE = 'application/octet-stream'

/**
 *  1. Gets the raw body info a Buffer and stores in `ctx.state.requestPacket`
 *  2. Parses it as an ILP prepare and stores in `ctx.state.requestPacket`
 *  3. Looks for reply packet in `ctx.state.responsePacket`
 *  4. Serializes reply and stores in `ctx.body`
 *
 * @param ctx Koa context
 * @param next Next middleware context
 */
export async function parseIlpPacket (ctx: Koa.Context, next: () => Promise<any>) {

  if (ctx.request.body !== undefined) return next()

  ctx.assert(ctx.request.type === CONTENT_TYPE, 400, 'Expected Content-Type of ' + CONTENT_TYPE)
  ctx.state.rawRequestPacket = await getRawBody(ctx.req)
  ctx.state.requestPacket = deserializeIlpPrepare(ctx.state.ctx.state.rawRequestPacket)
  await next()
  ctx.assert(ctx.state.responsePacket, 500, 'No response packet.')
  ctx.response.type = CONTENT_TYPE
  ctx.body = serializeIlpReply(ctx.state.responsePacket)
}
