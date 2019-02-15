export type Relation = 'parent' | 'child' | 'peer' | 'local'

export interface PeerInfo {
  id: string
  relation: Relation
  assetScale: number,
  assetCode: string,
  rateLimit?: {
    refillPeriod?: number,
    refillCount?: number,
    capacity?: number
  }
  throughput?: {
    refillPeriod?: number,
    incomingAmount?: string,
    outgoingAmount?: string
  }
}
