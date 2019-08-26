import { RafikiContext } from '../rafiki'
import { Transaction } from '../services/accounts'

export function createIncomingBalanceMiddleware () {
  return async ({ log, request, response, services: { accounts }, peers }: RafikiContext, next: () => Promise<any>) => {
    const { amount } = request.prepare

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const peer = await peers.incoming

    // Increase balance on prepare
    await accounts.adjustBalanceReceivable(BigInt(amount), peer.id, async (trx: Transaction) => {

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
  return async ({ log, request, response, services: { accounts }, peers }: RafikiContext, next: () => Promise<any>) => {
    const { amount } = request.prepare

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const peer = await peers.outgoing

    await accounts.adjustBalancePayable(BigInt(amount), peer.id, async (trx: Transaction) => {

      await next()

      if (response.fulfill) {
        await trx.commit()
      } else {
        await trx.rollback()
      }
    })
  }
}
