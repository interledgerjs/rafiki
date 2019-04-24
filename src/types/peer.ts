export type Relation = 'parent' | 'child' | 'peer' | 'local'

export type PeerRelation = 'parent' | 'peer' | 'child'

export interface PeerInfo {
  relation: PeerRelation,
  id: string,
  assetCode: string,
  assetScale: number,
  rules: RuleConfig[],
  protocols: ProtocolConfig[],
  settlement: {
    url: string,
    ledgerAddress: string
  }
}
export interface RuleConfig {
  name: string,
  [k: string]: any
}

export interface ProtocolConfig {
  name: string,
  [k: string]: any
}
