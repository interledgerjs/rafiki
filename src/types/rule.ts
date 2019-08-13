import { Middleware, ParameterizedContext } from 'koa'
import { IlpState, IlpMiddleWare } from '../koa/ilp-packet-middleware'
import { PeerState } from '../koa/peer-middleware'
import { PeerInfoService } from '../services/peer-info'
import { BalanceService } from '../services/balance'
import { AppServices } from '../services';
import { App } from '../app';

export interface RuleFunctions {
  startup?: () => Promise<void>
  shutdown?: () => Promise<void>
  incoming?: IlpMiddleWare
  outgoing?: IlpMiddleWare
}

const emptyMiddleware: IlpMiddleWare = async (ctx: ParameterizedContext<PeerState & IlpState>, next) => { await next() }

export class Rule {

  private _incoming: Middleware<PeerState & IlpState> = emptyMiddleware
  private _outgoing: Middleware<PeerState & IlpState> = emptyMiddleware

  constructor (protected _services: AppServices, { startup, shutdown, incoming, outgoing }: RuleFunctions) {
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

  protected _startup: () => Promise<void> = async () => {
    return
  }

  protected _shutdown: () => Promise<void> = async () => {
    return
  }

  protected _processIncoming: Middleware<PeerState & IlpState> = async (ctx, next) => {
    await next()
  }

  protected _processOutgoing: Middleware<PeerState & IlpState> = async (ctx, next) => {
    await next()
  }

  public async startup (): Promise<void> {
    return this._startup()
  }

  public async shutdown (): Promise<void> {
    return this._shutdown()
  }

  public get incoming () { return this._incoming }
  public get outgoing () { return this._outgoing }
}
