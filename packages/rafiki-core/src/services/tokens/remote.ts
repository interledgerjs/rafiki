import axios from 'axios'
import { TokenService, TokenInfo } from '.'
import { LoggingService } from '..'

export class RemoteTokenService implements TokenService {
  constructor (private _url: string, private _log: LoggingService) {
  }

  public async introspect (token: string): Promise<TokenInfo> {
    this._log.debug(`Introspecting token [${token}] at ${this._url} `)
    const { data } = await axios.post<TokenInfo>(this._url, { token })
    return data
  }

  public async lookup (tokenInfo: TokenInfo): Promise<string | undefined> { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error('not implemented')
  }

  public async store (token: string, tokenInfo: TokenInfo): Promise<void> { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error('not implemented')
  }

  public async delete (tokenOrtokenInfo: string | TokenInfo): Promise<void> { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error('not implemented')
  }

  public async create (tokenInfo: TokenInfo): Promise<string> { // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error('not implemented')
  }
}
