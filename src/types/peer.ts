import { BalanceConfig } from './balance'

export type Relation = 'parent' | 'child' | 'peer' | 'local'

export type PeerRelation = 'parent' | 'peer' | 'child'

export interface PeerInfo {
  relation: PeerRelation,
  relationWeight?: number,
  id: string,
  assetCode: string,
  assetScale: number,
  client?: ClientConfig
  balance?: BalanceConfig
  rules: { [name: string]: RuleConfig },
  protocols: { [name: string]: ProtocolConfig }
}

export interface ClientConfig {
  url: string,
  authToken?: string
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
