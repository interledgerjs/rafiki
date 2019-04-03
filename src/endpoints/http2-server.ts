import { Http2Server } from 'http2'
import { Http2Endpoint } from './http2'
import pathToRegexp from 'path-to-regexp'

export class Http2EndpointManager extends Map<string, Http2Endpoint> {

  private _pathRegex: RegExp

  constructor (server: Http2Server, path: string = '/ilp/:peerId') {
    super()
    this._pathRegex = pathToRegexp(path)

    server.on('stream', async (stream, headers, flags) => {
      const method = headers[':method']
      const path = headers[':path']

      // logger.silly('incoming http2 stream', { path, method })

      if (method !== 'POST' || typeof path === 'undefined') {
        stream.respond({ ':status': 400 })
        stream.end()
        return
      }

      const matches = this._pathRegex.exec(path)
      const peerId = (matches && matches.length > 1) ? matches[1] : undefined
      if (!peerId) {
        // TODO: Handle other URL routes
        stream.respond({ ':status': 400 })
        stream.end()
        return
      }

      const endpoint = this.get(peerId)
      if (!endpoint) {
        // TODO: Unknown peer. Handle unsolicited peer logic here
        stream.respond({ ':status': 403 })
        stream.end()
        return
      }

      endpoint.handleIncomingStream(stream)

    })
  }

}
