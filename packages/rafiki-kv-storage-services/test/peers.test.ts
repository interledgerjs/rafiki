import { MapStore } from '@kv-storage/core'
import { KvPeersService } from '../src/peers'
import { PeerInfo } from '@interledger/rafiki-core'

describe('KV Storage Peers Service', () => {
  let peersService: KvPeersService
  const alice: PeerInfo = {
    authToken: '',
    defaultAccountId: '',
    incomingThroughputLimit: 0n,
    incomingThroughputLimitRefillPeriod: 0,
    isCcpReceiver: false,
    isCcpSender: false,
    maxHoldWindow: 0,
    maxPacketAmount: 0n,
    minExpirationWindow: 0,
    outgoingThroughputLimit: 0n,
    outgoingThroughputLimitRefillPeriod: 0,
    rateLimitCapacity: 0n,
    rateLimitRefillCount: 0n,
    rateLimitRefillPeriod: 0,
    relation: 'peer',
    relationWeight: 0,
    url: 'http://test.local',
    id: 'alice'
  }

  beforeEach(() => {
    peersService = new KvPeersService()
  })

  it('can add a peer', async () => {
    await peersService.add(alice)

    const peer = await peersService.get('alice')
    expect(peer.id).toEqual('alice')
  })

})
