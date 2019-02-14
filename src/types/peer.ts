export type Relation = 'parent' | 'child' | 'peer' | 'local'

export interface PeerInfo {
  id: string
  relation: Relation
  assertScale: number,
  assetCode: string,
}
