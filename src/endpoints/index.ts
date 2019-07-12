import Koa from 'koa'
import { Endpoint } from '../types'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import { PluginEndpoint } from '../legacy/plugin-endpoint'
import { InMemoryMapStore } from '../stores/in-memory'
import compat from 'ilp-compat-plugin'
import { HttpEndpointManager } from './http-server'
import { HttpEndpoint } from './http'
export * from './request-stream'
export * from './request-stream-ws'

export type AuthFunction = (token: string) => Promise<string>

export interface PluginOpts {
  name: string,
  opts: {
    [k: string]: any
  }
}

export interface HttpOpts {
  peerUrl?: string,
  peerAuthToken?: string
}

export interface EndpointInfo {
  type: string,
  pluginOpts?: PluginOpts,
  httpOpts?: HttpOpts
}

// TODO: Support other endpoint types
export interface EndpointManagerServices {
  httpServer?: Koa,
  httpServerPath?: string,
  authService?: AuthFunction
}

export class EndpointManager {

  private _httpEndpoints?: HttpEndpointManager
  private _pluginEndpoints: Map<string, PluginEndpoint> = new Map()
  private _pluginStores: Map<string, InMemoryMapStore> = new Map()

  constructor ({ httpServer: httpServer, authService, httpServerPath }: EndpointManagerServices) {
    if (httpServer) {
      if (!authService) throw new Error('Auth Service required for Http2 Endpoints')
      this._httpEndpoints = new HttpEndpointManager(httpServer, authService, httpServerPath)
    }
  }

  /**
   * Create an endpoint for a peer given specific endpoint info
   * @param peerId id of the peer to create the endpoint for
   * @param endpointInfo info required to create the endpoint
   */
  public createEndpoint (peerId: string, endpointInfo: EndpointInfo): Endpoint<IlpPrepare, IlpReply> {
    const { type } = endpointInfo
    switch (type) {
      case ('http'):
        if (this._httpEndpoints) {
          if (!endpointInfo.httpOpts) {
            throw new Error('Http Options need to be specified for given user')
          }
          const endpoint = new HttpEndpoint(endpointInfo.httpOpts)
          this._httpEndpoints.set(peerId, endpoint)
          return endpoint
        } else {
          throw new Error(`HTTP endpoint type not configured`)
        }
      case ('plugin'):
        if (!endpointInfo.pluginOpts) {
          throw new Error('pluginOptions needs to be specified to create a plugin endpoint')
        }
        const api = {
          store: new InMemoryMapStore()
        }
        const pluginOpts = Object.assign({}, endpointInfo.pluginOpts.opts, { _store: api.store })
        this._pluginStores.set(peerId, api.store)
        const PluginType = require(endpointInfo.pluginOpts.name)
        const plugin = compat(new PluginType(pluginOpts, api))
        const endpoint = new PluginEndpoint(plugin)
        this._pluginEndpoints.set(peerId, endpoint)
        return endpoint
      default:
        throw new Error(`Endpoint type not supported type=${type}`)
    }
  }

  /**
   * Close all endpoints for the given peer
   * @param peerId id of the peer that is being disconnected
   */
  public async closeEndpoints (peerId: string) {
    if (this._httpEndpoints) {
      const endpoint = this._httpEndpoints.get(peerId)
      if (endpoint) {
        this._httpEndpoints.delete(peerId)
      }
    }
    if (this._pluginEndpoints.get(peerId)) {
      const endpoint = this._pluginEndpoints.get(peerId)
      if (endpoint) {
        await endpoint.close()
        this._pluginEndpoints.delete(peerId)
        this._pluginStores.delete(peerId)
      }
    }
  }

  /**
   * Close all endpoints
   */
  public closeAll () {
    this._pluginEndpoints.forEach(endpoint => endpoint.close())
  }

}
