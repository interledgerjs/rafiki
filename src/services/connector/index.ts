import {
  CcpRouteControlRequest,
  CcpRouteUpdateRequest,
  CcpRouteControlResponse,
  CcpRouteUpdateResponse
} from 'ilp-protocol-ccp'
import { RelationWeights } from '../../types'

export interface Connector {
  handleRouteControl: (peerId: string, request: CcpRouteControlRequest) => Promise<CcpRouteControlResponse>

  handleRouteUpdate: (peerId: string, request: CcpRouteUpdateRequest) => Promise<CcpRouteUpdateResponse>

  getPeerForAddress (destination: string): string

  getAddresses (peerId: string): string[]
}

export function getRouteWeight (peerId: string): number {
  let weight: number = 0
  const peer = this._routeManager.getPeer(peerId)
  if (peer) {
    switch (peer.getRelation()) {
      case('parent'):
        weight += RelationWeights.parent
        break
      case('peer'):
        weight += RelationWeights.peer
        break
      case('child'):
        weight += RelationWeights.child
        break
      case('local'):
        weight += RelationWeights.local
        break
    }
  }
  return weight
}
