
export type Relation = 'parent' | 'child' | 'peer' | 'local'

export type PeerRelation = 'parent' | 'peer' | 'child'

export interface PeerInfo {
  [key: string]: any
  id: string,
  url?: string,
  relation: PeerRelation,
  relationWeight?: number,
  authToken?: string
  isCcpSender: boolean,
  isCcpReceiver: boolean
  defaultAccountId: string
}

export enum RelationWeights {
  parent = 400,
  peer = 300,
  child = 200,
  local = 100
}
