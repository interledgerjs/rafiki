import { log } from '../../winston'
import axios from 'axios'
import { AuthService as AuthServiceInterface } from '../../types/auth'

const logger = log.child({ component: 'remote-auth-service' })

export class RemoteAuthService implements AuthServiceInterface {

  constructor (private url: string) {
  }

  async getPeerIdByToken (token: string) {
    logger.debug('Getting peerId for token:' + token)
    const { data } = await axios.post(`${this.url}/token`, { token })
    return data.peerId
  }

  async getTokenByPeerId (peerId: string) {
    // no-op at the moment
    return ''
  }

  async setPeerToken (peerId: string, token: string) {
    // no-op at the moment
  }

  async removePeerToken (peerId: string) {
    // no-op at the moment
  }

  async generateAuthToken (peerId: string = '') {
    // no-op at the moment
    return ''
  }

}
