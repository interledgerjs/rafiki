import { Peer } from '../services/peers'
import { RafikiContext } from '../rafiki'

export interface SettlementInfo {
  url: string,
  settleTo: bigint
  settleThreshold: bigint
}

export function createIncomingBalanceMiddleware () {
  return async ({ log, ilp, services: { accounts }, state: { peers } }: RafikiContext, next: () => Promise<any>) => {
    const { amount } = ilp.prepare

    // TODO - Move to dedicated middleware
    // Handle peer.settle
    // if (destination.startsWith('peer.settle')) {
    //   if (this.settlementEngineInterface) {
    //     const response = await this.settlementEngineInterface.receiveRequest(peer.id, ilp.req)
    //     logger.debug('response from SE after forwarding it message' + JSON.stringify(response))
    //     return response
    //   } else {
    //     logger.error('Cannot handle peer.settle message. No settlement engine configured for peerId=' + peer.id)
    //     const reject: IlpReject = {
    //       code: 'F00',
    //       triggeredBy: 'peer.settle',
    //       data: Buffer.allocUnsafe(0),
    //       message: 'Failed to deliver message to SE'
    //     }
    //     return reject
    //   }
    // }

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const peer = await peers.incoming

    // Increase balance on prepare
    const account = await accounts.adjustBalance(BigInt(amount), peer.id)
    log.debug('balance increased due to incoming ilp prepare', { peer, amount, account })

    try {
      await next()
    } catch (err) {
      // Refund on error
      const account = await accounts.adjustBalance(-BigInt(amount), peer.id)
      log.debug('incoming packet refunded due to error', { peer, amount, account })
      throw err
    }

    if (ilp.fulfill) {
      this.maybeSettle(await peers.incoming).catch(log.error)
      // this.stats.incomingDataPacketValue.increment(this.peer, { result: 'fulfilled' }, + amount)
    } else {
      // Refund on reject
      const account = await accounts.adjustBalance(-BigInt(amount), peer.id)
      log.debug('incoming packet refunded due to ilp reject', { peer, amount, account })
    }
  }
}

export function createOutgoingBalanceMiddleware () {
  return async ({ log, ilp, services: { accounts }, state: { peers } }: RafikiContext, next: () => Promise<any>) => {
    const { amount, destination } = ilp.outgoingPrepare

    if (destination.startsWith('peer.settle')) {
      await next()
      return
    }

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const peer = await peers.incoming

    // We do nothing here (i.e. unlike for incoming packets) and wait until the packet is fulfilled
    // This means we always take the most conservative view of our balance with the upstream peer
    try {
      await next()
    } catch (err) {
      log.debug('outgoing packet not applied due to error', { peer, amount })
      // this.stats.outgoingDataPacketValue.increment(peer, { result: 'failed' }, + amount)
      throw err
    }

    if (ilp.fulfill) {
      // Decrease balance on fulfill
      const account = await accounts.adjustBalance(BigInt(amount), peer.id)
      this.maybeSettle(await peers.outgoing).catch()
      log.debug('balance decreased due to outgoing ilp fulfill', { peer, amount, account })
      // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
      // this.stats.balance.setValue(peer, {}, balance.getValue().toNumber())
      // this.stats.outgoingDataPacketValue.increment(peer, { result: 'fulfilled' }, + amount)
    } else {
      log.debug('outgoing packet not applied due to ilp reject', { peer, amount })
      // this.stats.outgoingDataPacketValue.increment(peer, { result: 'rejected' }, + amount)
    }
  }
}

// TODO: Figure out settlement
async function maybeSettle (peer: Peer): Promise<void> {
  // if (!settlement || !settlementEngine) {
  //   logger.debug('Not deciding whether to settle for accountId=' + peer.id + '. No settlement engine configured.')
  //   return
  // }
  //
  // const settleTo: bigint = settlement.settleTo
  // const settleThreshold: bigint = settlement.settleThreshold
  // logger.debug('deciding whether to settle for accountId=' + peer.id, { balance: balance.getValue().toString(), bnSettleThreshold: settleThreshold ? settleThreshold.toString() : 'undefined' })
  // const settle = settleThreshold && settleThreshold > balance.getValue()
  // if (!settle) return
  //
  // const settleAmount = settleTo - balance.getValue()
  // logger.debug('settlement triggered for accountId=' + peer.id, { balance: balance.getValue().toString(), settleAmount: settleAmount.toString() })
  //
  // try {
  //   await settlementEngine.sendSettlement(peer.id, settleAmount, peer.assetScale)
  //   balance.adjust(settleAmount)
  //   logger.debug('balance for accountId=' + peer.id + ' increased due to outgoing settlement', { settleAmount: settleAmount.toString(), newBalance: balance.getValue().toString() })
  // } catch (error) {
  //   logger.error('Could not complete settlement for accountId=' + peer.id, { scale: peer.assetScale, balance: balance.getValue().toString(), settleAmount: settleAmount.toString(), error: error.message })
  // }
}
