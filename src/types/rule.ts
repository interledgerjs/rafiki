import { RafikiMiddleware, RafikiContext } from '../rafiki'

export interface RuleFunctions {
  startup?: (ctx: RafikiContext) => Promise<void>
  shutdown?: (ctx: RafikiContext) => Promise<void>
  incoming?: RafikiMiddleware
  outgoing?: RafikiMiddleware
}

const emptyMiddleware: RafikiMiddleware = async (ctx: RafikiContext, next) => { await next() }

export class Rule {

  private _incoming: RafikiMiddleware = emptyMiddleware
  private _outgoing: RafikiMiddleware = emptyMiddleware

  constructor ({ startup, shutdown, incoming, outgoing }: RuleFunctions) {
    if (startup) {
      this._startup = startup
    }
    if (shutdown) {
      this._shutdown = shutdown
    }
    if (incoming) {
      this._incoming = incoming
    }
    if (outgoing) {
      this._outgoing = outgoing
    }
  }

  protected _startup: (ctx: RafikiContext) => Promise<void> = async () => {
    return
  }

  protected _shutdown: (ctx: RafikiContext) => Promise<void> = async () => {
    return
  }

  protected _processIncoming: RafikiMiddleware = async (ctx, next) => {
    await next()
  }

  protected _processOutgoing: RafikiMiddleware = async (ctx, next) => {
    await next()
  }

  public async startup (ctx: RafikiContext): Promise<void> {
    return this._startup(ctx)
  }

  public async shutdown (ctx: RafikiContext): Promise<void> {
    return this._shutdown(ctx)
  }

  public get incoming () { return this._incoming }
  public get outgoing () { return this._outgoing }
}
