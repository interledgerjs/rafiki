import { Http2Endpoint } from './http2'
import { Endpoint } from '../types'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import { Http2EndpointManager } from './http2-server'
import { Http2Server } from 'http2'

export * from './http2'
export * from './request-stream'
export * from './request-stream-ws'

export interface EndpointInfo {
  type: string,
  url: string
}

// TODO: Support other endpoint types
export interface EndpointManagerServices {
  http2Server?: Http2Server
}

export class EndpointManager {

  private _http2Endpoints?: Http2EndpointManager

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
          const endpoint = new Http2Endpoint({ url })
          this._http2Endpoints.set(peerId, endpoint)
          return endpoint
        } else {
          throw new Error(`HTTP2 endpoint type not configured`)
        }
      default:
        throw new Error(`Endpoint type not supported type=${type}`)
    }
  }

  /**
   * Close all endpoints for the given peer
   * @param peerId id of the peer that is being disconnected
   */
  public closeEndpoints (peerId: string) {
    if (this._http2Endpoints) {
      const endpoint = this._http2Endpoints.get(peerId)
      if (endpoint) {
        endpoint.close()
        this._http2Endpoints.delete(peerId)
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
  }

}
