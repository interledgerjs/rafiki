/**
 * Parse ILP packets
 */
import {
  deserializeIlpFulfill,
  deserializeIlpPrepare,
  deserializeIlpReject,
  IlpFulfill,
  IlpPrepare,
  IlpReject,
  IlpReply,
  isFulfill,
  serializeIlpFulfill,
  serializeIlpReject,
  deserializeIlpReply
} from 'ilp-packet'
import { Readable } from 'stream'
import { RafikiContext } from '../rafiki'
import getRawBody from 'raw-body'

const CONTENT_TYPE = 'application/octet-stream'

export interface IlpPacketMiddlewareOptions {
  getRawBody?: (req: Readable) => Promise<Buffer>
}

interface RawPacket {
  readonly raw: Buffer
}

export interface RafikiPrepare extends IlpPrepare {
  intAmount: bigint
  readonly originalAmount: bigint
  readonly originalExpiresAt: Date

  readonly amountChanged: boolean
  readonly expiresAtChanged: boolean
}

export class ZeroCopyIlpPrepare implements RafikiPrepare {
  private _originalAmount: bigint
  private _originalExpiresAt: Date
  private _prepare: IlpPrepare
  private _amount: bigint
  public _expiresAtChanged = false
  public _amountChanged = false

  constructor (prepare: Buffer | IlpPrepare) {
    const packet = (Buffer.isBuffer(prepare))
      ? deserializeIlpPrepare(prepare)
      : prepare
    this._prepare = packet
    this._originalAmount = this._amount = BigInt(packet.amount)
    this._originalExpiresAt = packet.expiresAt
  }

  get destination (): string {
    return this._prepare.destination
  }

  get executionCondition (): Buffer {
    return this._prepare.executionCondition
  }

  get data (): Buffer {
    return this._prepare.data
  }

  get expiresAt (): Date {
    return this._prepare.expiresAt
  }

  get amount (): string {
    return this._prepare.amount
  }

  get intAmount (): bigint {
    return this._amount
  }

  set expiresAt (val: Date) {
    this._expiresAtChanged = true
    this._prepare.expiresAt = val
  }

  set amount (val: string) {
    this._amountChanged = true
    this._prepare.amount = val
    this._amount = BigInt(val)
  }

  set intAmount (val: bigint) {
    this._amountChanged = true
    this._prepare.amount = val.toString()
    this._amount = val
  }

  get amountChanged () {
    return this._amountChanged
  }

  get expiresAtChanged () {
    return this._expiresAtChanged
  }

  get originalAmount () {
    return this._originalAmount
  }

  get originalExpiresAt () {
    return this._originalExpiresAt
  }

}

export function createIlpPacketMiddleware (config?: IlpPacketMiddlewareOptions) {

  const _getRawBody = (config && config.getRawBody) ? config.getRawBody : getRawBody

  return async function ilpPacket (ctx: RafikiContext, next: () => Promise<any>) {

    ctx.assert(ctx.request.type === CONTENT_TYPE, 400, 'Expected Content-Type of ' + CONTENT_TYPE)
    const buffer = await _getRawBody(ctx.req)
    const prepare = new ZeroCopyIlpPrepare(buffer)
    ctx.req.prepare = prepare
    ctx.request.prepare = prepare
    ctx.req.rawPrepare = buffer
    ctx.request.rawPrepare = buffer
    ctx.path = ilpAddressToPath(prepare.destination, ctx.path)

    let reject: IlpReject | undefined = undefined
    let fulfill: IlpFulfill | undefined = undefined
    let rawReject: Buffer | undefined = undefined
    let rawFulfill: Buffer | undefined = undefined

    const properties: PropertyDescriptorMap = {
      fulfill : {
        enumerable: true,
        get: () => fulfill,
        set: (val: IlpFulfill | undefined) => {
          fulfill = val
          if (val) {
            reject = rawReject = undefined
            rawFulfill = serializeIlpFulfill(val)
          } else {
            rawFulfill = undefined
          }
        }
      },
      rawFulfill : {
        enumerable: true,
        get: () => rawFulfill,
        set: (val: Buffer | undefined) => {
          rawFulfill = val
          if (val) {
            reject = rawReject = undefined
            fulfill = deserializeIlpFulfill(val)
          } else {
            fulfill = undefined
          }
        }
      },
      reject : {
        enumerable: true,
        get: () => reject,
        set: (val: IlpReject | undefined) => {
          reject = val
          if (val) {
            fulfill = rawFulfill = undefined
            rawReject = serializeIlpReject(val)
          } else {
            rawReject = undefined
          }
        }
      },
      rawReject : {
        enumerable: true,
        get: () => rawReject,
        set: (val: Buffer | undefined) => {
          rawReject = val
          if (val) {
            fulfill = rawFulfill = undefined
            reject = deserializeIlpReject(val)
          } else {
            reject = undefined
          }
        }
      },
      reply : {
        enumerable: true,
        get: () => (fulfill || reject),
        set: (val: IlpReply | undefined) => {
          if (val) {
            if (isFulfill(val)) {
              fulfill = val
              rawFulfill = serializeIlpFulfill(val)
              reject = rawReject = undefined
            } else {
              reject = val
              rawReject = serializeIlpReject(val)
              fulfill = rawFulfill = undefined
            }
          } else {
            fulfill = rawFulfill = undefined
            reject = rawReject = undefined
          }
        }
      },
      rawReply : {
        enumerable: true,
        get: () => (rawFulfill || rawReject),
        set: (val: Buffer | undefined) => {
          if (val) {
            const packet = deserializeIlpReply(val)
            if (isFulfill(packet)) {
              fulfill = packet
              rawFulfill = val
              reject = rawReject = undefined
            } else {
              reject = packet
              rawReject = val
              fulfill = rawFulfill = undefined
            }
          } else {
            fulfill = rawFulfill = undefined
            reject = rawReject = undefined
          }
        }
      }
    }
    Object.defineProperties(ctx.res, properties)
    Object.defineProperties(ctx.response, properties)

    await next()

    ctx.assert(!ctx.body, 500, 'response body already set')
    ctx.assert(ctx.response.rawReply, 500, 'ilp reply not set')
    ctx.body = ctx.response.rawReply
  }

}

export function ilpAddressToPath (ilpAddress: string, prefix?: string) {
  return (prefix ? prefix : '') + ilpAddress.replace(/\./g, '/')
}
