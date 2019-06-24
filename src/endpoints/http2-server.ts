import { Http2Server } from 'http2'
import { Http2Endpoint } from './http2'
import pathToRegexp from 'path-to-regexp'

type AuthFunction = (token: string) => Promise<string>

function extractAuthToken (header: string): string {
  const parts = header.split(' ')
  if (parts.length === 2) {
    const scheme = parts[0]
    const token = parts[1]
    if (/^Bearer$/i.test(scheme)) {
      return token
    }
  }
  return ''
}

export class Http2EndpointManager extends Map<string, Http2Endpoint> {

  private _pathRegex: RegExp
  private _auth: AuthFunction

  constructor (server: Http2Server, auth: AuthFunction, path: string = '/ilp') {
    super()
    this._pathRegex = pathToRegexp(path)
    this._auth = auth

    server.on('stream', async (stream, headers, flags) => {
      const method = headers[':method']
      const path = headers[':path']
      const authHeader = headers.authorization

      if (method !== 'POST' || typeof path === 'undefined' || typeof authHeader === 'undefined') {
        stream.respond({ ':status': 400 })
        stream.end()
        return
      }

      const token = extractAuthToken(authHeader)
      const peerId = await this._auth(token)
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
