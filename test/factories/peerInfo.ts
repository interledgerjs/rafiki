import { Factory } from 'rosie'
import { PeerInfo } from '../../src/types'

export const PeerInfoFactory = Factory.define<PeerInfo>('PeerInfo').attrs({
  id: 'alice',
  relation: 'child',
  assetCode: 'XRP',
  assetScale: 9,
  protocols: [],
  rules: []
})