import { log } from '../../winston'
import axios from 'axios'
import { TokenService, TokenInfo } from '.'

const logger = log.child({ component: 'remote-auth-service' })

export class RemoteTokenService implements TokenService {
  constructor (private _url: string) {
  }

  public async introspect (token: string): Promise<TokenInfo> {
    logger.debug(`Introspecting token [${token}] at ${this._url} `)
    const { data } = await axios.post<TokenInfo>(this._url, { token })
    return data
  }
  public async lookup (tokenInfo: TokenInfo): Promise<string | undefined> {
    throw new Error('not implemented')
  }
  public async store (token: string, tokenInfo: TokenInfo): Promise<void> {
    throw new Error('not implemented')
  }
  public async delete (tokenOrtokenInfo: string | TokenInfo): Promise<void> {
    throw new Error('not implemented')
  }
  public async create (tokenInfo: TokenInfo): Promise<string> {
    throw new Error('not implemented')
  }
}
