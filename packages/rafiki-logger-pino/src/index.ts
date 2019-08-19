import HttpLogger, { Options } from 'pino-http'
import { DestinationStream, SerializedRequest, SerializedResponse } from 'pino'
import { IncomingMessage, ServerResponse } from 'http'
import { RafikiContext, RafikiMiddleware, RafikiRequestMixin, RafikiResponseMixin } from '@interledger/rafiki-core'

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
  ilpAmount: string
  ilpExecutionCondition: string
  IlpExpiresAt: Date
  raw: IncomingMessage & RafikiRequestMixin
}
export interface SerializedIlpResponse extends SerializedResponse {
  ilpFulfillment: string
  ilpRejectCode: string
  ilpRejectMessage: string
  ilpRejectTriggeredBy: string
  raw: ServerResponse & RafikiResponseMixin
}

function serializeIlpPrepare (req: SerializedIlpRequest) {
  if (req.raw.prepare) {
    req.ilpAmount = req.raw.prepare.amount
    req.ilpExecutionCondition = req.raw.prepare.executionCondition.toString('hex')
    req.IlpExpiresAt = req.raw.prepare.expiresAt
    return req
  }
}

function serializeIlpReply (res: SerializedIlpResponse) {
  if (res.raw.fulfill) {
    res.ilpFulfillment = res.raw.fulfill.fulfillment.toString('hex')
  }
  if (res.raw.reject) {
    res.ilpRejectCode = res.raw.reject.code
    res.ilpRejectMessage = res.raw.reject.message
    res.ilpRejectTriggeredBy = res.raw.reject.triggeredBy
  }
  return res
}
