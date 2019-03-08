import { Rule, IlpRequestHandler, RuleRequestHandler } from '../types/rule'
import { PeerInfo } from '../types/peer'
import { IlpPrepare, isFulfill } from 'ilp-packet'
import { log } from '../winston'
import * as Redis from 'ioredis'
import { InsufficientLiquidityError } from 'ilp-packet/dist/src/errors'
const logger = log.child({ component: 'async-balance-rule' })

export interface AsyncBalanceRuleServices {
  peerInfo: PeerInfo
  redisInstance: Redis.Redis
}

export class AsyncBalanceRule extends Rule {
  private peer: PeerInfo
  private redis: Redis.Redis

  constructor ({ peerInfo, redisInstance }: AsyncBalanceRuleServices) {
    super({})
    this.peer = peerInfo
    this.redis = redisInstance
  }

  protected _startup = async () => {
    // await this.redis.connect()
    return
  }

  protected _processIncoming: RuleRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    const { amount } = request

    // Ignore zero amount packets
    if (amount === '0') {
      return next(request)
    }

    const isEnabled = await this.redis.get(`${this.peer.id}:balance:enabled`)

    if (!isEnabled) {
      throw new InsufficientLiquidityError('')
    }

    // Increase balance on prepare
    // redis push
    this.redis.xadd('balance', '*', 'peerId', this.peer.id, 'type', 'prepare', 'amount', amount, 'pipeline', 'incoming')

    let result
    try {
      result = await next(request)
    } catch (err) {
      // Refund on error
      this.redis.xadd('balance', '*', 'peerId', this.peer.id, 'type', 'failed', 'amount', amount, 'pipeline', 'incoming')
      throw err
    }

    if (isFulfill(result)) {
      this.redis.xadd('balance', '*', 'peerId', this.peer.id, 'type', 'fulfill', 'amount', amount, 'pipeline', 'incoming')
    } else { // Reject Packet
      // Refund on reject
      this.redis.xadd('balance', '*', 'peerId', this.peer.id, 'type', 'reject', 'amount', amount, 'pipeline', 'incoming')
    }
    return result
  }

  protected _processOutgoing: RuleRequestHandler = async (request: IlpPrepare, next: IlpRequestHandler) => {
    const { amount } = request
    const { peer } = this

    // Ignore zero amount packets
    if (amount === '0') {
      return next(request)
    }

    this.redis.xadd('balance', '*', 'peerId', peer.id, 'type', 'prepare', 'amount', amount, 'pipeline', 'outgoing')

    // We do nothing here (i.e. unlike for incoming packets) and wait until the packet is fulfilled
    // This means we always take the most conservative view of our balance with the upstream peer
    let result
    try {
      result = await next(request)
    } catch (err) {
      this.redis.xadd('balance', '*', 'peerId', peer.id, 'type', 'failed', 'amount', amount, 'pipeline', 'outgoing')
      throw err
    }

    if (isFulfill(result)) {
      // Decrease balance on prepare
      this.redis.xadd('balance', '*', 'peerId', peer.id, 'type', 'fulfill', 'amount', amount, 'pipeline', 'outgoing')
      // balance.subtract(amount)
    } else {
      // Rejected so don't stress
      this.redis.xadd('balance', '*', 'peerId', this.peer.id, 'type', 'reject', 'amount', amount, 'pipeline', 'outgoing')
    }

    return result
  }

  protected _shutdown = async () => {
    // Disconnect from Redis
    this.redis.disconnect()

    return
  }

}
