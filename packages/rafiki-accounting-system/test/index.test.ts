import { AccountingSystem } from '../src'
import { InMemoryAccountsService, InMemoryPeers } from '@interledger/rafiki-core'
import {InMemorySettlementEngineService} from '../src/services/settlement-engine'

describe('Accounting System Test', () => {
  const accounts = new InMemoryAccountsService()
  const peers = new InMemoryPeers()
  const settlementEngines = new InMemorySettlementEngineService()

  const accounting = new AccountingSystem({
    peers: peers,
    accounts: accounts,
    settlementEngines
  })

  beforeEach(async () => {
    await settlementEngines.add('xrp', 'https://localhost:3001')
    accounts.add({
      id: 'alice',
      peerId: 'alice',
      assetCode: 'XRP',
      assetScale: 6,
      maximumPayable: 0n,
      maximumReceivable: 0n,
      settlementEngine: 'xrp'
    })
    await accounting.listen()
  })

  afterEach(async () => {
    await accounting.shutdown()
  })

  describe('Accounts', () => {
    it('Adding an account calls out to accounts SE', async () => {
      await accounting.addAccount('alice')
    })
  })
})
