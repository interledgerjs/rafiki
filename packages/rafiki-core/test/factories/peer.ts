import { Factory } from 'rosie'
import { Peer } from '../../src/services/peers'
import { InMemoryAccount } from '../../src/types'
import { PeerInfoFactory } from './peerInfo'

export const PeerFactory = Factory.define<Peer>('Peer').attrs({
  info: PeerInfoFactory.build(),
  client: {
    send: () => Promise.resolve(Buffer.from(''))
  },
  balance: new InMemoryAccount({})
})
