import { Http2Endpoint } from './http2'
import { Endpoint } from '../types'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import { Http2EndpointManager } from './http2-server'
import { Http2Server } from 'http2'
import { PluginEndpoint } from '../legacy/plugin-endpoint'
import { InMemoryMapStore } from '../stores/in-memory';
export * from './http2'
export * from './request-stream'
export * from './request-stream-ws'

export interface PluginOpts {
  name: string,
  opts: {
    [k: string]: any
  }
}

export interface EndpointInfo {
  type: string,
  url?: string,
  pluginOpts?: PluginOpts
}

// TODO: Support other endpoint types
export interface EndpointManagerServices {
  http2Server?: Http2Server
}

export class EndpointManager {

  private _http2Endpoints?: Http2EndpointManager
  private _pluginEndpoints: Map<string, PluginEndpoint> = new Map()
  private _pluginStores: Map<string, InMemoryMapStore> = new Map()

  constructor ({ http2Server }: EndpointManagerServices) {
    if (http2Server) {
      this._http2Endpoints = new Http2EndpointManager(http2Server)
    }
  }

  /**
   * Create an endpoint for a peer given specific endpoint info
   * @param peerId id of the peer to create the endpoint for
   * @param endpointInfo info required to create the endpoint
   */
  public createEndpoint (peerId: string, endpointInfo: EndpointInfo): Endpoint<IlpPrepare, IlpReply> {
    const { type, url } = endpointInfo
    switch (type) {
      case ('http'):
        if (this._http2Endpoints) {
          if (!url) {
            throw new Error('url needs to be specified to create an HTTP2 endpoint')
          }
          const endpoint = new Http2Endpoint({ url })
          this._http2Endpoints.set(peerId, endpoint)
          return endpoint
        } else {
          throw new Error(`HTTP2 endpoint type not configured`)
        }
      case ('plugin'):
        if (!endpointInfo.pluginOpts) {
          throw new Error('pluginOptions needs to be specified to create a plugin endpoint')
        }
        const store = new InMemoryMapStore()
        const pluginOpts = Object.assign({}, endpointInfo.pluginOpts.opts, { store })
        this._pluginStores.set(peerId, store)
        const PluginType = require(endpointInfo.pluginOpts.name)
        const plugin = new PluginType(pluginOpts)
        plugin.connect()
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
    if (this._http2Endpoints) {
      const endpoint = this._http2Endpoints.get(peerId)
      if (endpoint) {
        endpoint.close()
        this._http2Endpoints.delete(peerId)
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
    if (this._http2Endpoints) {
      this._http2Endpoints.forEach(endpoint => endpoint.close())
    }
    this._pluginEndpoints.forEach(endpoint => endpoint.close())
  }

}
