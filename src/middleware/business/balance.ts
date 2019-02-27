import { Middleware, IlpRequestHandler, MiddlewareRequestHandler } from '../../types/middleware'
import { PeerInfo } from '../../types/peer'
import BigNumber from 'bignumber.js'
import { IlpPrepare, Errors, isFulfill, IlpFulfill } from 'ilp-packet'
import Stats from '../../services/stats'
import { log } from '../../winston'
const logger = log.child({ component: 'balance-middleware' })

const { InsufficientLiquidityError } = Errors

interface BalanceOpts {
  initialBalance?: BigNumber
  minimum?: BigNumber
  maximum?: BigNumber
}

/**
 * TODO: Need a description for the convention used for balance. IE what is minimum, what is maximum. What does a add and subtract represent (DR or CR? etc)
 */
class Balance {
  private balance: BigNumber
  private minimum: BigNumber
  private maximum: BigNumber
  constructor ({
    initialBalance = new BigNumber(0),
    minimum = new BigNumber(0),
    maximum = new BigNumber(Infinity)
  }: BalanceOpts) {
    this.balance = initialBalance
    this.minimum = minimum
    this.maximum = maximum
  }

  add (amount: BigNumber | string | number) {
    const newBalance = this.balance.plus(amount)
    if (newBalance.gt(this.maximum)) {
      logger.error('rejected balance update. oldBalance=%s newBalance=%s amount=%s', this.balance, newBalance, amount)
      throw new InsufficientLiquidityError('exceeded maximum balance.')
    }

    this.balance = newBalance
  }

  subtract (amount: BigNumber | string | number) {
    const newBalance = this.balance.minus(amount)
    if (newBalance.lt(this.minimum)) {
      logger.error('rejected balance update. oldBalance=%s newBalance=%s amount=%s', this.balance, newBalance, amount)
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

export interface BalanceMiddlewareServices {
  peerInfo: PeerInfo,
  stats: Stats
}

export class BalanceMiddleware extends Middleware {
  private stats: Stats
  private balance: Balance
  private peer: PeerInfo

  constructor ({ peerInfo, stats }: BalanceMiddlewareServices) {
    super({})
    this.peer = peerInfo
    this.stats = stats

    if (peerInfo.balance) {
      let minimum = peerInfo.balance.minimum ? peerInfo.balance.minimum : '-Infinity'
      let maximum = peerInfo.balance.maximum

      this.balance = new Balance({
        minimum: new BigNumber(minimum),
        maximum: new BigNumber(maximum)
      })

      logger.info('initializing balance for account. account.id=%s minimumBalance=%s maximumBalance=%s', peerInfo.id, minimum, maximum)
    } else {
      logger.info('(!!!) balance middleware NOT enabled for account, this account can spend UNLIMITED funds. account.id=%s')
    }
  }

  protected _startup = async () => {
    // When starting up, check if we need to pre-fund / settle
    // tslint:disable-next-line:no-floating-promises
    this.maybeSettle()

    this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
    return
  }

  protected _processIncoming: MiddlewareRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    const { amount, destination } = request

    // Handle peer.settle
    if (destination === 'peer.settle') {

      this.modifyBalance('-' + amount)

      const peerSettleFulfill: IlpFulfill = {
        fulfillment: Buffer.from(''),
        data: Buffer.from('')
      }
      return peerSettleFulfill
    }

    // Ignore zero amount packets
    if (amount === '0') {
      return next(request)
    }

    // Increase balance on prepare
    this.balance.add(amount)
    logger.info('balance increased due to incoming ilp prepare. account.id=%s amount=%s newBalance=%s', this.peer.id, amount, this.balance.getValue())
    this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())

    let result
    try {
      result = await next(request)
    } catch (err) {
      // Refund on error
      this.balance.subtract(amount)
      logger.info('incoming packet refunded due to error. account.id=%s amount=%s newBalance=%s', this.peer.id, amount, this.balance.getValue())
      this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
      this.stats.incomingDataPacketValue.increment(this.peer, { result : 'failed' }, + amount)
      throw err
    }

    if (isFulfill(result)) {
      this.maybeSettle().catch(logger.error)
      this.stats.incomingDataPacketValue.increment(this.peer, { result : 'fulfilled' }, + amount)
    } else {
      // Refund on reject
      this.balance.subtract(amount)
      logger.info('incoming packet refunded due to ilp reject. account.id=%s amount=%s newBalance=%s', this.peer.id, amount, this.balance.getValue())
      this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
      this.stats.incomingDataPacketValue.increment(this.peer, { result : 'rejected' }, + amount)
    }

    return result
  }

  protected _processOutgoing: MiddlewareRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    const { amount, destination } = request
    const { peer, balance } = this

    if (destination === 'peer.settle') {
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
      logger.error('outgoing packet not applied due to error. account.id=%s amount=%s newBalance=%s', peer.id, amount, balance.getValue())
      this.stats.outgoingDataPacketValue.increment(peer, { result : 'failed' }, + amount)
      throw err
    }

    if (isFulfill(result)) {
      // Decrease balance on prepare
      balance.subtract(amount)
      this.maybeSettle().catch(logger.error)
      logger.info('balance decreased due to outgoing ilp fulfill. account.id=%s amount=%s newBalance=%s', peer.id, amount, balance.getValue())
      this.stats.balance.setValue(peer, {}, balance.getValue().toNumber())
      this.stats.outgoingDataPacketValue.increment(peer, { result : 'fulfilled' }, + amount)
    } else {
      logger.info('outgoing packet not applied due to ilp reject. account.id=%s amount=%s newBalance=%s', peer.id, amount, balance.getValue())
      this.stats.outgoingDataPacketValue.increment(peer, { result : 'rejected' }, + amount)
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
      throw new Error('account not found. account.id=' + this.peer.id)
    }
    return balance
  }

  modifyBalance (_amountDiff: BigNumber.Value): BigNumber {
    const amountDiff = new BigNumber(_amountDiff)
    const balance = this.balance
    logger.info('modifying balance account.id=%s amount=%s', this.peer.id, amountDiff.toString())
    if (amountDiff.isPositive()) {
      balance.add(amountDiff)
    } else {
      balance.subtract(amountDiff.negated())
      this.maybeSettle().catch(logger.error)
    }
    this.stats.balance.setValue(this.peer, {}, balance.getValue().toNumber())
    return balance.getValue()
  }

  private async maybeSettle (): Promise<void> {
    const { settleThreshold, settleTo = '0' } = this.peer.balance!
    const bnSettleThreshold = settleThreshold ? new BigNumber(settleThreshold) : undefined
    const bnSettleTo = new BigNumber(settleTo)
    const balance = this._getBalance()

    const settle = bnSettleThreshold && bnSettleThreshold.gt(balance.getValue())
    if (!settle) return

    const settleAmount = bnSettleTo.minus(balance.getValue())
    logger.info('settlement triggered. account.id=%s balance=%s settleAmount=%s', this.peer.id, balance.getValue(), settleAmount)

    // TODO: should send peer.settle
    await this.sendMoney(settleAmount.toString())
      .catch(e => {
        let err = e
        if (!err || typeof err !== 'object') {
          err = new Error('Non-object thrown: ' + e)
        }
        logger.error('error occurred during settlement. account.id=%s settleAmount=%s errInfo=%s', this.peer.id, settleAmount, err.stack ? err.stack : err)
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
