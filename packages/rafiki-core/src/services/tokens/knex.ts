import nanoid from 'nanoid/generate'
import Knex from 'knex'
import { log } from '../../logger'
import { AuthToken } from '../../models/AuthToken'
import { TokenService, TokenInfo } from '.'
import * as assert from 'assert'

const logger = log.child({ component: 'auth-service' })
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export class KnexTokenService implements TokenService {

  constructor (private _knex: Knex) {

  }

  async introspect (token: string): Promise<TokenInfo> {
    const authToken = await AuthToken.query(this._knex).where('id', token).first()
    return authToken ? {
      sub: authToken.peerId,
      active: true
    } : {
      active: false
    }
  }

  async lookup (tokenInfo: TokenInfo) {
    if (tokenInfo.sub) {
      const token = await AuthToken.query(this._knex).where('peerId', tokenInfo.sub).first()
      return token ? token.id : undefined
    }
    return undefined
  }

  async store (token: string, tokenInfo: TokenInfo): Promise<void> {
    assert.notStrictEqual(tokenInfo.sub, undefined, 'tokenInfo.sub must be provided')
    await AuthToken.query(this._knex).insert({ id: token, peerId: tokenInfo.sub }).catch(error => console.log('error', error))
  }

  async delete (tokenOrtokenInfo: TokenInfo | string): Promise<void> {
    const authToken = (typeof tokenOrtokenInfo === 'string')
      ? await AuthToken.query(this._knex).where('id', tokenOrtokenInfo).first()
      : await AuthToken.query(this._knex).where('peerId', tokenOrtokenInfo.sub).first()
    if (authToken) {
      await authToken.$query(this._knex).delete()
    }
  }

  async create (tokenInfo: TokenInfo) {
    const token = nanoid(alphabet, 36)

    if (tokenInfo.sub !== '') {
      logger.debug('setting peer token for ', tokenInfo.sub)
      await this.store(token, tokenInfo)
    }

    return token
  }

}
