import nanoid from 'nanoid/generate'

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export class AuthService {

  private _accountTokensMap: Map<string, string>

  constructor () {
    this._accountTokensMap = new Map()
  }

  async getPeerIdByToken (token: string) {
    return Object.keys(this._accountTokensMap).find(key => this._accountTokensMap[key] === token) || ''
  }

  async getTokenByPeerId (peerId: string) {
    return this._accountTokensMap.get(peerId)
  }

  async setPeerToken (peerId: string, token: string) {
    this._accountTokensMap.set(peerId, token)
  }

  async removePeerToken (peerId: string) {
    this._accountTokensMap.delete(peerId)
  }

  async generateAuthToken (peerId: string = '') {
    const token = nanoid(alphabet, 36)

    if (peerId !== '') {
      console.log('setting peer token for', peerId)
      this.setPeerToken(peerId, token)
    }

    return token
  }

}
