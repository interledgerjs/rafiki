export class PeerNotFoundError extends Error {
  constructor (peerId: string) {
    super('Peer not found. peerId=' + peerId)
    this.name = 'PeerNotFoundError'
  }
}
