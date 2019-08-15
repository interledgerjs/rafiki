export class AccountNotFoundError extends Error {
  constructor (accountId: string, peerId?: string) {
    super('Account not found. accountId=' + accountId + ' peerId=' + peerId || 'NOT SPECIFIED')
    this.name = 'AccountNotFoundError'
  }
}
