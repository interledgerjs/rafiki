import axios, { AxiosResponse } from 'axios'
import { Rule, IlpRequestHandler, RuleRequestHandler } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { IlpPrepare, isFulfill, IlpReply, IlpFulfill, IlpReject } from 'ilp-packet'
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
  public settlementEngineInterface: SettlementEngineInterface

  constructor ({ peerInfo, stats, balance }: BalanceRuleServices) {
    super({})
    this.peer = peerInfo
    this.stats = stats
    this.balance = balance
    this.settlementEngineInterface = new SettlementEngineInterface(peerInfo.settlement.url)
  }

  protected _startup = async () => {
    this.settlementEngineInterface.addAccount(this.peer)

    // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
    // this.stats.balance.setValue(this.peer, {}, this.balance.getValue())
    return
  }

  protected _processIncoming: RuleRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    const { amount, destination } = request

    // Handle peer.settle
    if (destination.startsWith('peer.settle')) {
      const response = await this.settlementEngineInterface.handleMessage(this.peer.id, request)
      logger.debug('response from SE after forwarding it message' + JSON.stringify(response))
      return response
    }

    // Ignore zero amount packets
    if (amount === '0') {
      return next(request)
    }

    // Increase balance on prepare
    this.balance.update(BigInt(amount))
    logger.debug('balance increased due to incoming ilp prepare', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })

    // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
    // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())

    let result
    try {
      result = await next(request)
    } catch (err) {
      // Refund on error
      this.balance.update(BigInt(-amount))
      logger.debug('incoming packet refunded due to error', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })
      // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
      // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
      this.stats.incomingDataPacketValue.increment(this.peer, { result: 'failed' }, + amount)
      throw err
    }

    if (isFulfill(result)) {
      this.maybeSettle().catch()
      this.stats.incomingDataPacketValue.increment(this.peer, { result: 'fulfilled' }, + amount)
    } else {
      // Refund on reject
      this.balance.update(BigInt(-amount))
      logger.debug('incoming packet refunded due to ilp reject', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })

      // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
      // this.stats.balance.setValue(this.peer, {}, this.balance.getValue().toNumber())
      this.stats.incomingDataPacketValue.increment(this.peer, { result: 'rejected' }, + amount)
    }

    return result
  }

  protected _processOutgoing: RuleRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    const { amount, destination } = request
    const { peer, balance } = this

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
      logger.debug('outgoing packet not applied due to error', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })
      this.stats.outgoingDataPacketValue.increment(peer, { result: 'failed' }, + amount)
      throw err
    }

    if (isFulfill(result)) {
      // Decrease balance on prepare
      balance.update(BigInt(-amount))
      this.maybeSettle().catch()
      logger.debug('balance decreased due to outgoing ilp fulfill', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })
      // TODO: This statistic isn't a good idea but we need to provide another way to get the current balance
      // this.stats.balance.setValue(peer, {}, balance.getValue().toNumber())
      this.stats.outgoingDataPacketValue.increment(peer, { result: 'fulfilled' }, + amount)
    } else {
      logger.debug('outgoing packet not applied due to ilp reject', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })
      this.stats.outgoingDataPacketValue.increment(peer, { result: 'rejected' }, + amount)
    }

    return result
  }

  protected _shutdown = async () => {
    this.settlementEngineInterface.removeAccount(this.peer.id)
  }

  getStatus () {
    return this.balance.toJSON()
  }

  private async maybeSettle (): Promise<void> {
    const { settleThreshold, settleTo = '0' } = this.peer.settlement
    const bnSettleThreshold = settleThreshold ? BigInt(settleThreshold) : undefined
    const bnSettleTo = BigInt(settleTo)
    const balance = this.balance
    logger.debug('deciding whether to settle for accountId=' + this.peer.id, { balance: balance.getValue().toString(), bnSettleThreshold: bnSettleThreshold ? bnSettleThreshold.toString() : 'undefined'})
    const settle = bnSettleThreshold && bnSettleThreshold > this.balance.getValue()
    if (!settle) return

    const settleAmount = bnSettleTo - balance.getValue()
    logger.debug('settlement triggered for accountId=' + this.peer.id, { balance: balance.getValue().toString(), settleAmount: settleAmount.toString() })

    try {
      this.balance.update(settleAmount)
      logger.debug('balance for accountId=' + this.peer.id + ' increased due to outgoing settlement', { settleAmount: settleAmount.toString(), newBalance: balance.getValue().toString() })
      await this.settlementEngineInterface.doSettlement(this.peer.id, settleAmount, this.peer.assetScale)
    } catch (error) {
      logger.error('Could not complete settlement for accountId=' + this.peer.id, { scale: this.peer.assetScale, balance: balance.getValue().toString(), settleAmount: settleAmount.toString(), error: error.message })
    }
  }

}

class SettlementEngineInterface {
  private _url: string

  constructor (url: string) {
    this._url = url
  }

  addAccount (peerInfo: PeerInfo) {
    const rule = peerInfo.rules.find(rule => rule.name === 'balance')
    if (!rule) {
      logger.error('Failed to create account on settlement engine for peer=' + peerInfo.id, { peerInfo: peerInfo })
      throw new Error('Balance rule needs to be defined to add account to settlement engine')
    }

    logger.info('Creating account on settlement engine for peer=' + peerInfo.id + ' endpoint:' + `${this._url}/accounts`)
    axios.post(`${this._url}/accounts`, { id: peerInfo.id })
    .then(response => {
      logger.info('Created account on settlement engine', { response: response.status })
    })
    .catch(error => {
      logger.error('Failed to create account on settlement engine. Retrying in 5s', { response: error.response })
      const timeout = setTimeout(() => this.addAccount(peerInfo), 5000)
      timeout.unref()
    })
  }

  removeAccount (id: string) {
    logger.info('Removing account on settlement engine', { accountId: id })
    axios.delete(`${this._url}/accounts/${id}`).catch(error => {
      logger.error('Failed to delete account on settlement engine for peer=' + id, { accountId: id, response: error.response })
    })
  }

  async handleMessage (accountId: string, packet: IlpPrepare): Promise<IlpReply> {
    logger.debug('Forwarding packet onto settlement engine', { accountId, packet, url: `${this._url}/accounts/${accountId}/messages` })
    const bufferMessage = packet.data
    try {
      const response = await axios.post(`${this._url}/accounts/${accountId}/messages`, bufferMessage, { headers: { 'content-type': 'application/octet-stream' } })
      const ilpFulfill: IlpFulfill = {
        data: response.data || Buffer.from('') ,
        fulfillment: STATIC_FULFILLMENT
      }
      return ilpFulfill
    } catch (error) {
      logger.error('Could not deliver message to SE.', { errorStatus: error.status, errorMessage: error.message })
      const ilpReject: IlpReject = {
        code: 'F00',
        triggeredBy: 'peer.settle',
        data: Buffer.allocUnsafe(0),
        message: 'Failed to deliver message to SE'
      }
      return ilpReject
    }
  }

  async doSettlement (accountId: string, amount: bigint, scale: number): Promise<AxiosResponse> {
    logger.debug('requesting SE to do settlement', { accountId, amount: amount.toString(), scale })
    const message = {
      amount: amount.toString(),
      scale
    }

    return axios.post(`${this._url}/accounts/${accountId}/settlement`, message)
  }
}
