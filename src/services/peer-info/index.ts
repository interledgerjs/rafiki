import { PeerInfo } from '../../types'
import { PeerService } from '..'

export interface PeerInfoService extends PeerService<PeerInfo> {
  create: (peer: PeerInfo) => Promise<PeerInfo>

}
