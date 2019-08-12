import { PeerInfo } from '../src'

test('Example test', async () => {
  const peerInfo: PeerInfo = {
    id: 'alice',
    assetCode: 'USD',
    assetScale: 2,
    protocols: [],
    rules: [],
    relation: 'peer'
  }

  expect(peerInfo.id).toBe('alice')
})
