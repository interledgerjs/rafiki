import nanoid from 'nanoid/generate'
import Knex from 'knex'
import { log } from '../../winston'
import { AuthToken } from '../../models/AuthToken'
import { AuthService as AuthServiceInterface } from '../../types/auth'

const logger = log.child({ component: 'auth-service' })
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export class AuthService implements AuthServiceInterface {

  constructor (private _knex: Knex) {

  }

  async getPeerIdByToken (token: string) {
    const authToken = await AuthToken.query(this._knex).where('id', token).first()
    return authToken ? authToken.peerId : ''
  }

  async getTokenByPeerId (peerId: string) {
    const authToken = await AuthToken.query(this._knex).where('peerId', peerId).first()
    return authToken ? authToken.id : ''
  }

  async setPeerToken (peerId: string, token: string) {
    await AuthToken.query(this._knex).insert({ id: token, peerId }).catch(error => console.log('error', error))
  }

  async removePeerToken (peerId: string) {
    const authToken = await AuthToken.query(this._knex).where('peerId', peerId).first()
    if (authToken) {
      await authToken.$query(this._knex).delete()
    }
  }

  async generateAuthToken (peerId: string = '') {
    const token = nanoid(alphabet, 36)

    if (peerId !== '') {
      logger.debug('setting peer token for', peerId)
      await this.setPeerToken(peerId, token)
    }

    return token
  }

  async isAdminToken (token: string): Promise<boolean> {
    const peerId = await this.getPeerIdByToken(token)
    return peerId === 'self'
  }

}
