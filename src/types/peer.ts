export type Relation = 'parent' | 'child' | 'peer' | 'local'

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
