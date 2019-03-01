export type Relation = 'parent' | 'child' | 'peer' | 'local'

export interface PeerInfo {
  relation: 'parent' | 'peer' | 'child',
  id: string,
  assetCode: string,
  assetScale: number,
  balance?: {
    minimum: bigint,
    maximum: bigint,
    settleThreshold?: bigint,
    settleTo: bigint
  },
  deduplicate?: {
    cleanupInterval?: number,
    packetLifetime?: number
  },
  maxPacketAmount?: bigint,
  throughput?: {
    refillPeriod?: number,
    incomingAmount?: bigint,
    outgoingAmount?: bigint
  },
  rateLimit?: {
    refillPeriod?: number,
    refillCount?: bigint,
    capacity?: bigint
  },
  options?: object,
  sendRoutes?: boolean,
  receiveRoutes?: boolean,
  ilpAddressSegment?: string
}
