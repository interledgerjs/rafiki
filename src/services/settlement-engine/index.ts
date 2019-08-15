import { IlpPrepare, IlpReply } from 'ilp-packet'

export interface SettlementEngine {

  addAccount: (accountId: string) => Promise<void>
  removeAccount: (accountId: string) => Promise<void>
  receiveRequest: (accountId: string, packet: IlpPrepare) => Promise<IlpReply>
  sendSettlement: (accountId: string, amount: bigint, scale: number) => Promise<void>
}

export * from './remote'
