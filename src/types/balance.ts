import { Errors } from 'ilp-packet'
import { log } from '../winston'
import { MAX_UINT_64 } from '../constants'
const { InsufficientLiquidityError } = Errors
const logger = log.child({ component: 'in-memory-balance' })

/**
 * TODO: Need a description for the convention used for balance. IE what is minimum, what is maximum. What does a add and subtract represent (DR or CR? etc)
 */

export interface BalanceOpts {
  initialBalance?: bigint
  minimum?: bigint
  maximum?: bigint
  scale?: number
}

export interface JSONBalanceSummary {
  balance: string
  minimum: string
  maximum: string
}

export interface Balance {
  scale: number
  update: (amount: bigint) => void
  getValue: () => bigint
  toJSON: () => JSONBalanceSummary
}

export class InMemoryBalance implements Balance {
  private balance: bigint
  private minimum: bigint
  private maximum: bigint
  scale: number
  constructor ({
    initialBalance = 0n,
    minimum = 0n,
    maximum = BigInt(MAX_UINT_64),
    scale = 6
  }: BalanceOpts) {
    this.balance = initialBalance
    this.minimum = minimum
    this.maximum = maximum
    this.scale = scale
  }

  update (amount: bigint) {
    const newBalance = this.balance + amount
    if (newBalance > this.maximum) {
      logger.error(`exceeded maximum balance. proposedBalance=${newBalance.toString()} maximum balance=${this.maximum.toString()}`)
      throw new InsufficientLiquidityError('exceeded maximum balance.')
    }

    if (newBalance < this.minimum) {
      logger.error(`insufficient funds. oldBalance=${this.balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${this.minimum.toString()}`)
      throw new Error(`insufficient funds. oldBalance=${this.balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${this.minimum.toString()}`)
    }

    this.balance = newBalance
  }

  getValue (): bigint {
    return this.balance
  }

  toJSON (): JSONBalanceSummary {
    return {
      balance: this.balance.toString(),
      minimum: this.minimum.toString(),
      maximum: this.maximum.toString()
    }
  }
}
