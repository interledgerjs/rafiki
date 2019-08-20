
import { SerializedRequest, SerializedResponse } from 'pino'
import { wrapRequestSerializer, wrapResponseSerializer } from 'pino-std-serializers'
import { IncomingMessage, ServerResponse } from 'http'
import { RafikiRequestMixin, RafikiResponseMixin } from '@interledger/rafiki-core'

export const serializers = {
  req: wrapRequestSerializer(serializeIlpPrepare),
  res: wrapResponseSerializer(serializeIlpReply)
}

export interface SerializedIlpRequest extends SerializedRequest {
  raw: IncomingMessage & RafikiRequestMixin
}
export interface SerializedIlpResponse extends SerializedResponse {
  raw: ServerResponse & RafikiResponseMixin
}

function serializeIlpPrepare (req: SerializedIlpRequest) {
  if (req.raw && req.raw.prepare) {
    req['ilp-destination'] = req.raw.prepare.destination
    req['ilp-amount'] = req.raw.prepare.amount
    req['ilp-execution-condition'] = req.raw.prepare.executionCondition.toString('hex')
    req['ilp-expires-at'] = req.raw.prepare.expiresAt
  }
  return req
}

function serializeIlpReply (res: SerializedIlpResponse) {
  if (res.raw && res.raw.fulfill) {
    res['ilp-fulfillment'] = res.raw.fulfill.fulfillment.toString('hex')
  }
  if (res.raw && res.raw.reject) {
    res['ilp-reject-code'] = res.raw.reject.code
    res['ilp-reject-message'] = res.raw.reject.message
    res['ilp-reject-triggered-by'] = res.raw.reject.triggeredBy
  }
  return res
}
