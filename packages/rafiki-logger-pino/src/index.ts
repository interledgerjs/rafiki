import HttpLogger, { Options } from 'pino-http'
import { DestinationStream, SerializedRequest, SerializedResponse } from 'pino'
import { ParameterizedContext } from 'koa'
import { RafikiContext, RafikiMiddleware, Logger } from '@interledger/rafiki-core'

export function pino (opts?: Options, stream?: DestinationStream): RafikiMiddleware {

  // TODO: Look into custom serializers for the ILP request/response stuff

  const wrap = HttpLogger(
    Object.assign(opts || {}, {
      serializers : {
        req : serializeIlpPrepare,
        res: serializeIlpReply
      }
    }), stream)
  return async function pino (ctx: RafikiContext, next: () => Promise<any>) {
    wrap(ctx.req, ctx.res)
    ctx.log = ctx.req.log
    return next().catch(function (e) {
      ctx.log.error({
        res: ctx.res,
        err: {
          type: e.constructor.name,
          message: e.message,
          stack: e.stack
        },
        responseTime: ctx.res['responseTime']
      }, 'request threw an error')
      throw e
    })
  }
}

export interface SerializedIlpRequest extends SerializedRequest {
  amount: string
  condition: Buffer
  expiresAt: number
}

interface SerializedIlpReject extends SerializedResponse {
  code: string
  triggeredBy: string
}

interface SerializedIlpFulfill extends SerializedResponse {
  fulfillment: Buffer
}

function serializeIlpPrepare (req: SerializedIlpRequest) {
  // TODO: Extract top-level properties
  req.amount = '10'
  req.condition = Buffer.alloc(32)
  req.expiresAt = Date.now() + 30000
  return req
}

function serializeIlpReply (res: SerializedIlpReject | SerializedIlpFulfill) {
  // TODO: Extract top-level properties
  return res
}
