import {
  CcpRouteControlRequest,
  CcpRouteUpdateRequest,
  CcpRouteControlResponse,
  CcpRouteUpdateResponse
} from 'ilp-protocol-ccp'
import { PeerRelation } from '../../types'

export interface Connector {
  handleRouteControl: (peerId: string, request: CcpRouteControlRequest) => Promise<CcpRouteControlResponse>

  handleRouteUpdate: (peerId: string, request: CcpRouteUpdateRequest) => Promise<CcpRouteUpdateResponse>

  addPeer: (peerId: string, relation: PeerRelation, weight: number, isSender: boolean, isReceiver: boolean) => Promise<void>

  removePeer: (peerId: string) => Promise<void>

  getPeerForAddress (destination: string): string

  addOwnAddress: (address: string, weight: number) => void

  getOwnAddress: () => string

  getAddresses: (peerId: string) => string[]

  removeOwnAddress: (address: string) => void

  addRoute: (peerId: string, prefix: string) => void

  removeRoute: (peerId: string, prefix: string) => void
}
