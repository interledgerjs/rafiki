export type Relation = 'parent' | 'child' | 'peer' | 'local'

// export interface PeerInfo {
//   relation: 'parent' | 'peer' | 'child',
//   id: string,
//   assetCode: string,
//   assetScale: number,
//   balance?: {
//     minimum: bigint,
//     maximum: bigint,
//     settleThreshold?: bigint,
//     settleTo: bigint
//   },
//   deduplicate?: {
//     cleanupInterval?: number,
//     packetLifetime?: number
//   },
//   maxPacketAmount?: bigint,
//   throughput?: {
//     refillPeriod?: number,
//     incomingAmount?: bigint,
//     outgoingAmount?: bigint
//   },
//   rateLimit?: {
//     refillPeriod?: number,
//     refillCount?: bigint,
//     capacity?: bigint
//   },
//   options?: object,
//   sendRoutes?: boolean,
//   receiveRoutes?: boolean,
//   ilpAddressSegment?: string
// }

export type PeerRelation = 'parent' | 'peer' | 'child'

export interface PeerInfo {
  relation: PeerRelation,
  relationWeight?: number,
  id: string,
  assetCode: string,
  assetScale: number,
  rules: RuleConfig[],
  protocols: ProtocolConfig[]
}
export interface RuleConfig {
  name: string,
  [k: string]: any
}

export interface ProtocolConfig {
  name: string,
  [k: string]: any
}

export enum RelationWeights {
  parent = 400,
  peer = 300,
  child = 200,
  local = 100
}
