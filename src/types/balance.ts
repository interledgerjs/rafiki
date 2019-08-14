import { Errors } from 'ilp-packet'
import { log } from '../winston'
import { MAX_UINT_64 } from '../constants'
const { InsufficientLiquidityError } = Errors
const logger = log.child({ component: 'in-memory-balance' })

/**
 * TODO: Need a description for the convention used for balance. IE what is minimum, what is maximum. What does a add and subtract represent (DR or CR? etc)
 */

export interface BalanceConfig {
  initialBalance?: bigint
  minimum?: bigint
  maximum?: bigint
}

export interface JSONBalanceSummary {
  balance: string
  minimum: string
  maximum: string
}

export interface Balance {
  adjust: (amount: bigint, minimum: bigint, maximum: bigint) => void
  getValue: () => bigint
  toJSON: (minimum: bigint, maximum: bigint) => JSONBalanceSummary
}

export class InMemoryBalance implements Balance {
  private balance: bigint
  constructor (initialBalance = 0n) {
    this.balance = initialBalance
  }

  adjust (amount: bigint, minimum: bigint, maximum: bigint) {
    const newBalance = this.balance + amount
    if (newBalance > maximum) {
      logger.error(`exceeded maximum balance. proposedBalance=${newBalance.toString()} maximum balance=${maximum.toString()}`)
      throw new InsufficientLiquidityError('exceeded maximum balance.')
    }

    if (newBalance < minimum) {
      logger.error(`insufficient funds. oldBalance=${this.balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${minimum.toString()}`)
      throw new Error(`insufficient funds. oldBalance=${this.balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${minimum.toString()}`)
    }

    this.balance = newBalance
  }

  getValue (): bigint {
    return this.balance
  }

  toJSON (minimum: bigint, maximum: bigint): JSONBalanceSummary {
    return {
      balance: this.balance.toString(),
      minimum: minimum.toString(),
      maximum: maximum.toString()
    }
  }
}
