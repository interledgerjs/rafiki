import Koa, { ParameterizedContext, Middleware } from 'koa'
import { Connector } from './services/connector'
import { IlpState, ilpPacketMiddleware } from './koa/ilp-packet-middleware'
import { PeerState, peerMiddleWare } from './koa/peer-middleware'
import getRawBody from 'raw-body'
import { PeerService } from './services/peers'
interface RafikiServices {
  connector: Connector
  peers: PeerService
}

interface RafikiAppConfig extends Partial<RafikiServices> {
}

interface RafikiIlpConfig {
  getIncomingPeerId?: (ctx: Koa.Context) => string
  getOutgoingPeerId?: (ctx: Koa.Context) => string
}

export type RafikiState = IlpState & PeerState
export type RafikiContextMixin = { services: RafikiServices }
export type RafikiContext = Koa.ParameterizedContext<RafikiState, RafikiContextMixin>
export type ParameterizedRafikiContext<T> = Koa.ParameterizedContext<RafikiState & T, RafikiContextMixin>
export type RafikiMiddleware = Middleware<RafikiState, RafikiContextMixin>
export class Rafiki extends Koa<RafikiState, RafikiContextMixin> {

  private _connector?: Connector
  private _peers?: PeerService

  constructor ({ connector, peers }: Partial<RafikiServices>) {
    super()
    this._connector = connector
    this._peers = peers
    const peersOrThrow = () => {
      if (this._peers) return this._peers
      throw new Error('No peers service provided to the app')
    }
    const connectorOrThrow = () => {
      if (this._connector) return this._connector
      throw new Error('No connector service provided to the app')
    }
    this.use((ctx: ParameterizedContext<RafikiState, RafikiContextMixin>, next: () => Promise<any>) => {
      ctx.services = {
        get peers () {
          return peersOrThrow()
        },
        get connector () {
          return connectorOrThrow()
        }
      }
    })
  }

  public connector (connector: Connector) {
    this._connector = connector
  }

  public peers (peers: PeerService) {
    this._peers = peers
  }

  public useIlp ({ getIncomingPeerId, getOutgoingPeerId }: RafikiIlpConfig) {
    this.use(ilpPacketMiddleware({ getRawBody }))
    this.use(peerMiddleWare({ getIncomingPeerId, getOutgoingPeerId }))
  }
}
