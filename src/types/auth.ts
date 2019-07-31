export interface AuthService {
  getPeerIdByToken: (token: string) => Promise<string>
  getTokenByPeerId: (token: string) => Promise<string>
  setPeerToken: (peerId: string, token: string) => Promise<void>
  removePeerToken: (peerId: string) => Promise<void>
  generateAuthToken: (peerId?: string) => Promise<string>
}
