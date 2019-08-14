import { Rule } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { isFulfill } from 'ilp-packet'
import { Stats } from '../services/stats'
import { log } from '../winston'
import { Balance } from '../types'
import { Peer } from '../services/peers'
const logger = log.child({ component: 'in-memory-balance-rule' })

export interface BalanceRuleServices {
  peerInfo: PeerInfo,
  stats: Stats,
  balance: Balance
}

export interface SettlementInfo {
  url: string,
  settleTo: bigint
  settleThreshold: bigint
}

export class BalanceRule extends Rule {

  constructor () {
    super({
      incoming: async ({ services, state: { peers, ilp } }, next) => {
        const { amount } = ilp.req
        const { info, balance } = peers.incoming

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

        // Increase balance on prepare
        balance.adjust(BigInt(amount))
        logger.debug('balance increased due to incoming ilp prepare', { peerId: info.id, amount, balance: balance.getValue().toString() })

        // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
        // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())

        try {
          await next()
        } catch (err) {
          // Refund on error
          balance.adjust(BigInt(-amount))
          logger.debug('incoming packet refunded due to error', { peerId: info.id, amount, balance: balance.getValue().toString() })
          // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
          // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
          // this.stats.incomingDataPacketValue.increment(this.peer, { result: 'failed' }, + amount)
          throw err
        }

        if (ilp.res && isFulfill(ilp.res)) {
          this.maybeSettle(peers.incoming).catch(logger.error)
          // this.stats.incomingDataPacketValue.increment(this.peer, { result: 'fulfilled' }, + amount)
        } else {
          // Refund on reject
          balance.adjust(BigInt(-amount))
          logger.debug('incoming packet refunded due to ilp reject', { peerId: info.id, amount, balance: balance.getValue().toString() })

          // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
          // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
          // this.stats.incomingDataPacketValue.increment(peer, { result: 'rejected' }, + amount)
        }
      },
      outgoing: async ({ state: { peers, ilp } }, next) => {
        const { amount, destination } = ilp.req
        const { info, balance } = peers.outgoing

        if (destination.startsWith('peer.settle')) {
          await next()
          return
        }

        // Ignore zero amount packets
        if (amount === '0') {
          await next()
          return
        }

        // We do nothing here (i.e. unlike for incoming packets) and wait until the packet is fulfilled
        // This means we always take the most conservative view of our balance with the upstream peer
        try {
          await next()
        } catch (err) {
          logger.debug('outgoing packet not applied due to error', { peerId: info.id, amount, balance: balance.getValue().toString() })
          // this.stats.outgoingDataPacketValue.increment(peer, { result: 'failed' }, + amount)
          throw err
        }

        if (ilp.res && isFulfill(ilp.res)) {
          // Decrease balance on prepare
          balance.adjust(BigInt(-amount))
          this.maybeSettle(peers.outgoing).catch()
          logger.debug('balance decreased due to outgoing ilp fulfill', { peerId: info.id, amount, balance: balance.getValue().toString() })
          // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
          // this.stats.balance.setValue(peer, {}, balance.getValue().toNumber())
          // this.stats.outgoingDataPacketValue.increment(peer, { result: 'fulfilled' }, + amount)
        } else {
          logger.debug('outgoing packet not applied due to ilp reject', { peerId: info.id, amount, balance: balance.getValue().toString() })
          // this.stats.outgoingDataPacketValue.increment(peer, { result: 'rejected' }, + amount)
        }
      }
    })

    // if (!settlementInfo) {
    //   logger.warn('No settlement engine configured for peerId=' + peerInfo.id)
    // } else {
    //   this.settlementInfo = settlementInfo
    //   this.settlementEngineInterface = new SettlementEngineInterface(settlementInfo.url)
    // }
  }

  protected _startup = async () => {
    // TODO: Dedicated middleware
    // if (this.settlementEngineInterface) await this.settlementEngineInterface.addAccount(this.peer.id)

    // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
    // this.stats.balance.setValue(this.peer, {}, this.balance.getValue())
    return
  }

  protected _shutdown = async () => {
    // TODO: Dedicated middleware
    // if (this.settlementEngineInterface) await this.settlementEngineInterface.removeAccount(this.peer.id)
  }

  getStatus () {
    return this.balance.toJSON()
  }

  // TODO = Need to rethink this, possibly move into the settlement engine?
  private async maybeSettle ({ info, balance }: Peer): Promise<void> {
    if (!settlement || !settlementEngine) {
      logger.debug('Not deciding whether to settle for accountId=' + peer.id + '. No settlement engine configured.')
      return
    }

    const settleTo: bigint = settlement.settleTo
    const settleThreshold: bigint = settlement.settleThreshold
    logger.debug('deciding whether to settle for accountId=' + peer.id, { balance: balance.getValue().toString(), bnSettleThreshold: settleThreshold ? settleThreshold.toString() : 'undefined' })
    const settle = settleThreshold && settleThreshold > balance.getValue()
    if (!settle) return

    const settleAmount = settleTo - balance.getValue()
    logger.debug('settlement triggered for accountId=' + peer.id, { balance: balance.getValue().toString(), settleAmount: settleAmount.toString() })

    try {
      await settlementEngine.sendSettlement(peer.id, settleAmount, peer.assetScale)
      balance.adjust(settleAmount)
      logger.debug('balance for accountId=' + peer.id + ' increased due to outgoing settlement', { settleAmount: settleAmount.toString(), newBalance: balance.getValue().toString() })
    } catch (error) {
      logger.error('Could not complete settlement for accountId=' + peer.id, { scale: peer.assetScale, balance: balance.getValue().toString(), settleAmount: settleAmount.toString(), error: error.message })
    }
  }

}
