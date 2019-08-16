/**
 * Parse ILP packets
 */
import { deserializeIlpPrepare, IlpPrepare, IlpReply, IlpFulfill, IlpReject, serializeIlpPrepare, serializeIlpFulfill, deserializeIlpFulfill, serializeIlpReject, deserializeIlpReject, isFulfill, isReject } from 'ilp-packet'
import { Readable } from 'stream'
import { RafikiContext } from '../rafiki'
import { modifySerializedIlpPrepareAmount, modifySerializedIlpPrepareExpiry } from '../lib/ilp'
import getRawBody from 'raw-body'

const CONTENT_TYPE = 'application/octet-stream'

// TODO req and res are weird. Maybe it should be prepare and reply?
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
  getRawBody?: (req: Readable) => Promise<Buffer>
}

interface RawPacket {
  readonly raw: Buffer
}

/**
 * Overcomplicated context that attempts to avoid doing unnecessary serialization
 */
export class IlpContext {

  private _prepare: IlpPrepare & RawPacket
  private _outgoingPrepare: OutgoingIlpPrepare
  private _fulfill?: IlpFulfill
  private _fulfillRaw?: Buffer
  private _reject?: IlpReject
  private _rejectRaw?: Buffer
  public _expiresAtChanged = false
  public _amountChanged = false

  constructor (prepare: Buffer | IlpPrepare) {
    if (Buffer.isBuffer(prepare)) {
      const raw = prepare
      const packet = deserializeIlpPrepare(prepare)
      const outgoingPrepare = new OutgoingIlpPrepare(raw, packet)
      this._prepare = {
        ...packet,
        get raw () {
          if (outgoingPrepare.dirty) throw new Error('illegal access to raw incoming prepare packet after building outgoing prepare')
          return raw
        }
      }
      this._outgoingPrepare = outgoingPrepare
    } else {
      const raw = serializeIlpPrepare(prepare)
      const packet = prepare
      const outgoingPrepare = new OutgoingIlpPrepare(raw, packet)
      this._prepare = {
        ...packet,
        get raw () {
          if (outgoingPrepare.dirty) throw new Error('illegal access to raw incoming prepare packet after building outgoing prepare')
          return raw
        }
      }
    }
  }

  get prepare (): IlpPrepare & RawPacket {
    return this._prepare
  }

  get outgoingPrepare (): OutgoingIlpPrepare {
    return this._outgoingPrepare
  }

  get fulfill (): Readonly<IlpFulfill> & RawPacket | undefined {
    if (!this._fulfillRaw) {
      if (!this._fulfill) return undefined
      const ilp = this
      return {
        ...this._fulfill,
        get raw () {
          ilp._fulfillRaw = serializeIlpFulfill(this._fulfill)
          return ilp._fulfillRaw
        }
      }
    } else {
      if (!this._fulfill) this._fulfill = deserializeIlpFulfill(this._fulfillRaw)
      return {
        raw: this._fulfillRaw,
        ...this._fulfill
      }
    }
  }

  get reject (): Readonly<IlpReject> & RawPacket | undefined {
    if (!this._rejectRaw) {
      if (!this._reject) return undefined
      const ilp = this
      return {
        ...this._reject,
        get raw () {
          ilp._rejectRaw = serializeIlpReject(this._reject)
          return ilp._rejectRaw
        }
      }
    } else {
      if (!this._reject) this._reject = deserializeIlpReject(this._rejectRaw)
      return {
        ...this._reject,
        raw: this._rejectRaw
      }
    }
  }

  get reply () {
    return this.fulfill || this.reject
  }

  public respond (reply: IlpReply | Buffer) {
    if (Buffer.isBuffer(reply)) {
      if (reply[0] === 13) {
        this._fulfillRaw = reply
        this._reject = undefined
        this._rejectRaw = undefined
        return
      }
      if (reply[0] === 14) {
        this._rejectRaw = reply
        this._fulfill = undefined
        this._fulfillRaw = undefined
        return
      }
      // TODO: Custom error?
      throw new Error('invalid reply packet')
    } else {
      if (isFulfill(reply)) {
        this._fulfill = reply
        this._reject = undefined
        this._rejectRaw = undefined
        return
      }
      if (isReject(reply)) {
        this._reject = reply
        this._fulfill = undefined
        this._fulfillRaw = undefined
      }
    }
  }
}

export class OutgoingIlpPrepare implements IlpPrepare, RawPacket {

  private _amount: string
  private _executionCondition: Buffer
  private _expiresAt: Date
  private _destination: string
  private _data: Buffer
  private _raw: Buffer
  private _expiresAtDirty = false
  private _amountDirty = false
  private _rebuildRaw = false
  private _rawDirty = false

  constructor (raw: Buffer, packet: IlpPrepare) {
    this._amount = packet.amount
    this._executionCondition = packet.executionCondition
    this._expiresAt = packet.expiresAt
    this._destination = packet.destination
    this._data = packet.data
    this._raw = raw
  }

  get destination () {
    return this._destination
  }

  get executionCondition () {
    return this._executionCondition
  }

  get data () {
    return this._data
  }

  get expiresAt () {
    return this._expiresAt
  }

  get amount () {
    return this._amount
  }

  get dirty () {
    return this._rawDirty
  }

  set expiresAt (value: Date) {
    this._expiresAt = value
    this._expiresAtDirty = true
    this._rebuildRaw = true
  }

  set amount (value: string) {
    this._amount = value
    this._amountDirty = true
    this._rebuildRaw = true
  }

  get raw () {
    if (this._rebuildRaw) {
      if (this._amountDirty) {
        modifySerializedIlpPrepareAmount(this._raw, this._amount)
        this._rawDirty = true
        this._amountDirty = false
      }
      if (this._expiresAtDirty) {
        modifySerializedIlpPrepareExpiry(this._raw, this._expiresAt)
        this._rawDirty = true
        this._expiresAtDirty = false
      }
      this._rebuildRaw = false
    }
    return this._raw
  }
}

export function createIlpPacketMiddleware (config?: IlpPacketMiddlewareOptions) {

  const _getRawBody = (config && config.getRawBody) ? config.getRawBody : getRawBody

  return async function ilpPacket (ctx: RafikiContext, next: () => Promise<any>) {

    ctx.assert(ctx.request.type === CONTENT_TYPE, 400, 'Expected Content-Type of ' + CONTENT_TYPE)

    ctx.ilp = new IlpContext(await _getRawBody(ctx.req))
    ctx.path = ilpAddressToPath(ctx.path)

    await next()

    ctx.assert(ctx.ilp.reply, 500, 'empty reply')
    ctx.type = CONTENT_TYPE
    ctx.body = ctx.ilp.reply!.raw
  }

}

export function ilpAddressToPath (ilpAddress: string, prefix?: string) {
  return (prefix ? prefix + '/' : '') + ilpAddress.replace(/\./g, '/')
}
