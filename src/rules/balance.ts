import { Rule, IlpRequestHandler, RuleRequestHandler } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { IlpPrepare, isFulfill } from 'ilp-packet'
import { Stats } from '../services/stats'
import { log } from '../winston'
import { STATIC_FULFILLMENT } from '../constants'
import { Balance } from '../types'
const logger = log.child({ component: 'in-memory-balance-rule' })

export interface BalanceRuleServices {
  peerInfo: PeerInfo,
  stats: Stats,
  balance: Balance
}

export class BalanceRule extends Rule {
  private stats: Stats
  private balance: Balance
  private peer: PeerInfo

  constructor ({ peerInfo, stats, balance }: BalanceRuleServices) {
    super({})
    this.peer = peerInfo
    this.stats = stats
    this.balance = balance
  }

  protected _startup = async () => {

    // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
    // this.stats.balance.setValue(this.peer, {}, this.balance.getValue())
    return
  }

  protected _processIncoming: RuleRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    const { amount, destination } = request

    // Handle peer.settle
    if (destination.startsWith('peer.settle')) {

      this.modifyBalance(BigInt('-' + amount))

      return {
        fulfillment: STATIC_FULFILLMENT,
        data: Buffer.allocUnsafe(0)
      }
    }

    // Ignore zero amount packets
    if (amount === '0') {
      return next(request)
    }

    // Increase balance on prepare
    this.balance.update(BigInt(amount))
    logger.silly('balance increased due to incoming ilp prepare', { peerId: this.peer.id, amount, balance: this.balance.getValue() })

    // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
    // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())

    let result
    try {
      result = await next(request)
    } catch (err) {
      // Refund on error
      this.balance.update(BigInt(-amount))
      logger.debug('incoming packet refunded due to error', { peerId: this.peer.id, amount, balance: this.balance.getValue() })
      // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
      // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
      this.stats.incomingDataPacketValue.increment(this.peer, { result: 'failed' }, + amount)
      throw err
    }

    if (isFulfill(result)) {
      this.stats.incomingDataPacketValue.increment(this.peer, { result: 'fulfilled' }, + amount)
    } else {
      // Refund on reject
      this.balance.update(BigInt(-amount))
      logger.debug('incoming packet refunded due to ilp reject', { peerId: this.peer.id, amount, balance: this.balance.getValue() })

      // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
      // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
      this.stats.incomingDataPacketValue.increment(this.peer, { result: 'rejected' }, + amount)
    }

    return result
  }

  protected _processOutgoing: RuleRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    const { amount, destination } = request
    const { peer, balance } = this

    // TODO: adjust balance on success
    if (destination.startsWith('peer.settle')) {
      return next(request)
    }

    // Ignore zero amount packets
    if (amount === '0') {
      return next(request)
    }

    // We do nothing here (i.e. unlike for incoming packets) and wait until the packet is fulfilled
    // This means we always take the most conservative view of our balance with the upstream peer
    let result
    try {
      result = await next(request)
    } catch (err) {
      logger.debug('outgoing packet not applied due to error', { peerId: this.peer.id, amount, balance: this.balance.getValue() })
      this.stats.outgoingDataPacketValue.increment(peer, { result: 'failed' }, + amount)
      throw err
    }

    if (isFulfill(result)) {
      // Decrease balance on prepare
      balance.update(BigInt(-amount))
      logger.silly('balance decreased due to outgoing ilp fulfill', { peerId: this.peer.id, amount, balance: this.balance.getValue() })
      // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
      // this.stats.balance.setValue(peer, {}, balance.getValue().toNumber())
      this.stats.outgoingDataPacketValue.increment(peer, { result: 'fulfilled' }, + amount)
    } else {
      logger.debug('outgoing packet not applied due to ilp reject', { peerId: this.peer.id, amount, balance: this.balance.getValue() })
      this.stats.outgoingDataPacketValue.increment(peer, { result: 'rejected' }, + amount)
    }

    return result
  }

  protected _shutdown = async () => {
    return
  }

  getStatus () {
    return this.balance.toJSON()
  }

  modifyBalance (amountDiff: bigint): bigint {
    const balance = this.balance
    logger.info('modifying balance', { peerId: this.peer.id, amountDif: amountDiff.toString() })
    balance.update(amountDiff)

    // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
    // this.stats.balance.setValue(this.peer, {}, balance.getValue().toNumber())

    return balance.getValue()
  }
}
