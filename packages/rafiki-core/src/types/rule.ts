import { RafikiMiddleware, RafikiContext } from '../rafiki'

export interface RuleFunctions {
  incoming?: RafikiMiddleware
  outgoing?: RafikiMiddleware
}

const emptyMiddleware: RafikiMiddleware = async (ctx: RafikiContext, next) => { await next() }

export class Rule {

  readonly _incoming: RafikiMiddleware = emptyMiddleware
  readonly _outgoing: RafikiMiddleware = emptyMiddleware

  constructor ({ incoming, outgoing }: RuleFunctions) {
    if (incoming) {
      this._incoming = incoming
    }
    if (outgoing) {
      this._outgoing = outgoing
    }
  }

  protected _processIncoming: RafikiMiddleware = async (ctx, next) => {
    await next()
  }

  protected _processOutgoing: RafikiMiddleware = async (ctx, next) => {
    await next()
  }

  public get incoming () { return this._incoming }
  public get outgoing () { return this._outgoing }
}
