export type Relation = 'parent' | 'child' | 'peer' | 'local'

export interface PeerInfo {
  id: string
  relation: Relation
  assetScale: number,
  assetCode: string,
}
