import { Factory } from 'rosie'
import { Peer } from '../../src/services/peers'
import { InMemoryBalance } from '../../src/types'
import { PeerInfoFactory } from './peerInfo'

export const PeerFactory = Factory.define<Peer>('Peer').attrs({
  info: PeerInfoFactory.build(),
  client: {
    send: () => Promise.resolve(Buffer.from(''))
  },
  balance: new InMemoryBalance({})
})
