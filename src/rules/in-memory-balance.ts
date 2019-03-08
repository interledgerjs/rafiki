import { Rule, IlpRequestHandler, RuleRequestHandler } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { IlpPrepare, Errors, isFulfill } from 'ilp-packet'
import { Stats } from '../services/stats'
import { log } from '../winston'
import { MAX_UINT_64, STATIC_FULFILLMENT, MIN_INT_64 } from '../constants'
const logger = log.child({ component: 'in-memory-balance-rule' })

const { InsufficientLiquidityError } = Errors

interface BalanceOpts {
  initialBalance?: bigint
  minimum?: bigint
  maximum?: bigint
}

/**
 * TODO: Need a description for the convention used for balance. IE what is minimum, what is maximum. What does a add and subtract represent (DR or CR? etc)
 */
class Balance {
  private balance: bigint
  private minimum: bigint
  private maximum: bigint
  constructor ({
    initialBalance = 0n,
    minimum = 0n,
    maximum = BigInt(MAX_UINT_64)
  }: BalanceOpts) {
    this.balance = initialBalance
    this.minimum = minimum
    this.maximum = maximum
  }

  add (amount: bigint) {
    const newBalance = this.balance + amount
    if (newBalance > this.maximum) {
      logger.error('rejected balance update', { oldBalance: this.balance, newBalance, amount })
      throw new InsufficientLiquidityError('exceeded maximum balance.')
    }

    this.balance = newBalance
  }

  subtract (amount: bigint) {
    const newBalance = this.balance - amount
    if (newBalance < this.minimum) {
      logger.error('rejected balance update', { oldBalance: this.balance, newBalance, amount })
      throw new Error(`insufficient funds. oldBalance=${this.balance} proposedBalance=${newBalance}`)
    }

    this.balance = newBalance
  }

  getValue () {
    return this.balance
  }

  toJSON () {
    return {
      balance: this.balance.toString(),
      minimum: this.minimum.toString(),
      maximum: this.maximum.toString()
    }
  }
}

export interface InMemoryBalanceRuleServices {
  peerInfo: PeerInfo,
  stats: Stats
}

export class InMemoryBalanceRule extends Rule {
  private stats: Stats
  private balance: Balance
  private peer: PeerInfo
  private opts: {
    minimum: bigint,
    maximum: bigint,
    settleThreshold?: bigint,
    settleTo: bigint
  }

  constructor ({ peerInfo, stats }: InMemoryBalanceRuleServices) {
    super({})
    this.peer = peerInfo
    this.stats = stats

    const balance = peerInfo.rules.filter(rule => rule.name === 'balance')[0]
    this.opts = {
      minimum: balance.minimum,
      maximum: balance.maximum,
      settleThreshold: balance.settleThreshold,
      settleTo: balance.settleTo
    }

    if (balance) {
      let minimum = balance.minimum ? BigInt(balance.minimum) : MIN_INT_64
      let maximum = BigInt(balance.maximum)

      this.balance = new Balance({
        minimum,
        maximum
      })

      logger.info('initializing in memory balance for peer', { peerId: peerInfo.id, minimum, maximum })
    } else {
      logger.warn(`(!!!) balance middleware NOT enabled for peer, this peer can spend UNLIMITED funds peerId=${peerInfo.id}`)
    }
  }

  protected _startup = async () => {
    // When starting up, check if we need to pre-fund / settle
    this.maybeSettle().catch(e => { logger.error(e) })

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
    this.balance.add(BigInt(amount))
    logger.silly('balance increased due to incoming ilp prepare', { peerId: this.peer.id, amount, balance: this.balance.getValue() })

    // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
    // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())

    let result
    try {
      result = await next(request)
    } catch (err) {
      // Refund on error
      this.balance.subtract(BigInt(amount))
      logger.debug('incoming packet refunded due to error', { peerId: this.peer.id, amount, balance: this.balance.getValue() })
      // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
      // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
      this.stats.incomingDataPacketValue.increment(this.peer, { result: 'failed' }, + amount)
      throw err
    }

    if (isFulfill(result)) {
      this.maybeSettle().catch(logger.error)
      this.stats.incomingDataPacketValue.increment(this.peer, { result: 'fulfilled' }, + amount)
    } else {
      // Refund on reject
      this.balance.subtract(BigInt(amount))
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
      balance.subtract(BigInt(amount))
      this.maybeSettle().catch(e => logger.error(e))
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

  private _getBalance (): Balance {
    const balance = this.balance
    if (!balance) {
      throw new Error('peer not found. peerId=' + this.peer.id)
    }
    return balance
  }

  modifyBalance (amountDiff: bigint): bigint {
    const balance = this.balance
    logger.info('modifying balance', { peerId: this.peer.id, amountDif: amountDiff.toString() })
    if (amountDiff < 0) {
      this.maybeSettle().catch(e => { logger.error(e) })
    }
    balance.add(amountDiff)

    // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
    // this.stats.balance.setValue(this.peer, {}, balance.getValue().toNumber())

    return balance.getValue()
  }

  private async maybeSettle (): Promise<void> {
    const { settleThreshold, settleTo = '0' } = this.opts
    const bnSettleThreshold = settleThreshold ? BigInt(settleThreshold) : undefined
    const bnSettleTo = BigInt(settleTo)
    const balance = this._getBalance()

    const settle = bnSettleThreshold && (bnSettleThreshold > balance.getValue())
    if (!settle) return

    const settleAmount = bnSettleTo - balance.getValue()
    logger.info('settlement triggered', { peerId: this.peer.id, balance: balance.getValue(), settleAmount })

    // TODO: should send peer.settle and update balance if successful
    await this.sendMoney(settleAmount.toString())
      .catch(e => {
        let err = e
        if (!err || typeof err !== 'object') {
          err = new Error('Non-object thrown: ' + e)
        }
        logger.error('error occurred during settlement', { peerId: this.peer.id, settleAmount, err: err.stack ? err.stack : err })
      })
  }

  private async sendMoney (amount: string) {
    const settlePacket: IlpPrepare = {
      destination: 'peer.settle',
      amount: amount,
      expiresAt: new Date(),
      executionCondition: Buffer.from(''),
      data: Buffer.from('')
    }

    return this.outgoing.write(settlePacket)
  }
}
