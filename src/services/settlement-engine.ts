import * as Redis from 'ioredis'
import { MAX_UINT_64 } from '../constants'

interface BalanceMiddlewareMessage {
  peerId: string,
  type: string,
  amount: bigint,
  pipeline: string
}

interface SettlementEngineServices {
  redisClient: Redis.Redis,
  streamKey: string
}

export class SettlementEngine {

  redis: Redis.Redis
  streamKey: string
  lastMessageId: string | undefined
  peerBalances: Map<string, bigint> = new Map()
  peerLimits: Map<string, { min: bigint, max: bigint }> = new Map()
  polling: NodeJS.Immediate
  private started: boolean = false
  constructor ({ redisClient, streamKey }: SettlementEngineServices) {
    this.redis = redisClient
    this.streamKey = streamKey
    this.lastMessageId = undefined
  }

  async start (): Promise<void> {
    this.started = true
    // TODO: Handle case where redis status isn't connected

    await this.startPolling()
  }

  private startPolling = async (): Promise<void> => {
    return new Promise(async (resolve) => {
      await this.process(this.streamKey)
      this.polling = setImmediate(() => this.startPolling())
      this.polling.unref()
      resolve()
    })
  }

  async shutdown (): Promise<string> {
    clearImmediate(this.polling)
    return this.redis.quit()
  }

  setBalance (peerId: string, balance: bigint, minBalance?: bigint, maxBalance?: bigint) {
    if (this.started) throw new Error("Can't set balance once settlement engine has started.")
    this.peerBalances.set(peerId, balance)
    this.updateBalanceLimits(peerId, minBalance || 0n, maxBalance || BigInt(MAX_UINT_64))
  }

  updateBalanceLimits (peerId: string, min: bigint, max: bigint) {
    this.peerLimits.set(peerId, { min, max })
  }

  getBalanceLimits (peerId: string): { min: bigint, max: bigint } {
    const limits = this.peerLimits.get(peerId)
    if (!limits) throw new Error(`No limits have been set for peerId=${peerId}`)
    return limits
  }

  getBalance (peerId: string): bigint {
    const prevbalance = this.peerBalances.get(peerId)
    if (!prevbalance) throw new Error(`Balance has not been set for peerId=${peerId}`)
    return prevbalance
  }

  async updateBalance (peerId: string, delta: bigint) {
    const prevbalance = this.getBalance(peerId)
    const newBalance = prevbalance + delta
    const limits = this.getBalanceLimits(peerId)
    const isNewBalanceOutsideLimits = newBalance < limits.min || newBalance > limits.max
    const prevBalanceOutsideLimits = prevbalance < limits.min || prevbalance > limits.max

    if (isNewBalanceOutsideLimits) await this.redis.set(`${peerId}:balance:enabled`, false)
    if (prevBalanceOutsideLimits && !isNewBalanceOutsideLimits) await this.redis.set(`${peerId}:balance:enabled`, true)

    this.peerBalances.set(peerId, newBalance)
  }

  process = async (streamKey: string): Promise<void> => {
    const redisQuery = this.lastMessageId ? this.lastMessageId : '$'
    const data = await this.redis.xread('COUNT', 1, 'STREAMS', streamKey, redisQuery)

    if (data[0][1].length > 0) {
      this.lastMessageId = data[0][1][0][0]
      const message = this.parseMessageIntoObject(data[0][1][0][1])
      if (message.pipeline === 'incoming') await this.handleIncomingPipelineMessage(message)
      else await this.handleOutgoingPipelineMessage(message)
    }
  }

  parseMessageIntoObject (data: Array<string>): BalanceMiddlewareMessage {
    let object = {} as BalanceMiddlewareMessage
    for (let index = 0; index < data.length / 2 ; index++) {
      object[data[index * 2]] = data[index * 2 + 1]
    }

    if (!object.pipeline || !object.amount || !object.type || !object.peerId) throw new Error('Unable to parse data array into message object')

    object.amount = BigInt(object.amount)

    return object
  }

  async handleIncomingPipelineMessage (message: BalanceMiddlewareMessage) {
    const { peerId, amount } = message

    switch (message.type) {

      case 'prepare': {
        await this.updateBalance(peerId, amount)
        break
      }

      case 'fulfill': {
        break
      }

      case 'reject': {
        await this.updateBalance(peerId, -amount)
        break
      }

      case 'failed': {
        await this.updateBalance(peerId, -amount)
        break
      }

      default: {
        throw new Error('Unidentified message type.')
      }
    }
  }

  async handleOutgoingPipelineMessage (message: BalanceMiddlewareMessage) {
    const { peerId, amount } = message
    switch (message.type) {

      case 'prepare': {
        break
      }

      case 'fulfill': {
        await this.updateBalance(peerId, -amount)
        break
      }

      case 'reject': {
        break
      }

      case 'failed': {
        break
      }

      default: {
        throw new Error('Unidentified message type.')
      }
    }
  }

  getStatus () {
    const peers = Array.from(this.peerBalances.keys())
    let status = {}
    peers.forEach(peer => {
      const limit = this.getBalanceLimits(peer)
      status[peer] = {
        'balance': this.getBalance(peer).toString(),
        'minimum': limit.min.toString(),
        'maximum': limit.max.toString()
      }
    })
    return status
  }
}
