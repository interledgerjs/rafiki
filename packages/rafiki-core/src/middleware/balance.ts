import { RafikiContext } from '../rafiki'
import { Transaction } from '../services/accounts'

export function createIncomingBalanceMiddleware () {
  return async ({ request, response, services: { accounts }, peers }: RafikiContext, next: () => Promise<any>): Promise<void> => {
    const { amount } = request.prepare

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const peer = await peers.incoming

    if (!peer.accountId) {
      throw new Error('Account not specific for peer')
    }

    // Increase balance on prepare
    await accounts.adjustBalanceReceivable(BigInt(amount), peer.accountId, async (trx: Transaction) => {
      await next()

      if (response.fulfill) {
        await trx.commit()
      } else {
        await trx.rollback()
      }
    })
  }
}

export function createOutgoingBalanceMiddleware () {
  return async ({ request, response, services: { accounts }, peers }: RafikiContext, next: () => Promise<any>): Promise<void> => {
    const { amount } = request.prepare

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const peer = await peers.outgoing

    if (!peer.accountId) {
      throw new Error('Account not specific for peer')
    }

    await accounts.adjustBalancePayable(BigInt(amount), peer.accountId, async (trx: Transaction) => {
      await next()

      if (response.fulfill) {
        await trx.commit()
      } else {
        await trx.rollback()
      }
    })
  }
}
