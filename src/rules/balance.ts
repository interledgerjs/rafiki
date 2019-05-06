import axios from 'axios'
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

      this.settlementEngineInterface.handleMessage(this.peer.id, request)

      // TODO: what should the response be ?
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
    logger.silly('balance increased due to incoming ilp prepare', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })

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
      logger.debug('outgoing packet not applied due to error', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })
      this.stats.outgoingDataPacketValue.increment(peer, { result: 'failed' }, + amount)
      throw err
    }

    if (isFulfill(result)) {
      // Decrease balance on prepare
      balance.update(BigInt(-amount))
      logger.silly('balance decreased due to outgoing ilp fulfill', { peerId: this.peer.id, amount, balance: this.balance.getValue().toString() })
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

    logger.info('Creating account on settlement engine for peer=' + peerInfo.id + ' endpoint:' + `${this._url}/accounts`, { id: peerInfo.id, ledgerAddress: peerInfo.settlement.ledgerAddress, scale: peerInfo.assetScale, minimumBalance: rule.minimum, maximumBalance: rule.maximum, settlementThreshold: '5000000' })
    axios.put(`${this._url}/accounts`, { id: peerInfo.id, ledgerAddress: peerInfo.settlement.ledgerAddress, scale: peerInfo.assetScale, minimumBalance: rule.minimum, maximumBalance: rule.maximum, settlementThreshold: '5000000' }).catch(error => {
      logger.error('Failed to create account on settlement engine.', { response: error.response })
    })
  }

  removeAccount (id: string) {
    logger.info('Removing account on settlement engine', { accountId: id })
    axios.delete(`${this._url}/accounts/${id}`).catch(error => {
      logger.error('Failed to delete account on settlement engine for peer=' + id, { accountId: id, response: error.response })
    })
  }

  handleMessage (accountId: string, packet: IlpPrepare) {
    logger.debug('Forwarding packet onto settlement engine', { accountId, packet })
    // axios.post(`${this._url}/accounts/${accountId}/ilp`, { ...packet })
  }
}
