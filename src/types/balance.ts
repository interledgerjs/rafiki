import { Errors } from 'ilp-packet'
import { MAX_UINT_64 } from '../constants'
const { InsufficientLiquidityError } = Errors

/**
 * TODO: Need a description for the convention used for balance. IE what is minimum, what is maximum. What does a add and subtract represent (DR or CR? etc)
 */

export interface BalanceOpts {
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
  update: (amount: bigint) => void
  getValue: () => bigint
  toJSON: () => JSONBalanceSummary
}

export class InMemoryBalance implements Balance {
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

  update (amount: bigint) {
    const newBalance = this.balance + amount
    if (newBalance > this.maximum) {
      throw new InsufficientLiquidityError('exceeded maximum balance.')
    }

    if (newBalance < this.minimum) {
      throw new Error(`insufficient funds. oldBalance=${this.balance} proposedBalance=${newBalance} minimun balance=${this.minimum}`)
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
