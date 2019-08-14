import { Errors } from 'ilp-packet'
import { log } from '../winston'
import { MAX_UINT_64 } from '../constants'
const { InsufficientLiquidityError } = Errors
const logger = log.child({ component: 'in-memory-balance' })

/**
 * TODO: Need a description for the convention used for balance. IE what is minimum, what is maximum. What does a add and subtract represent (DR or CR? etc)
 */

export interface BalanceConfig {
  initialBalance: bigint
  minimum: bigint
  maximum: bigint
}

export interface JSONBalanceSummary {
  balance: string
  minimum: string
  maximum: string
}

export interface Balance {
  adjust: (amount: bigint, minimum: bigint, maximum: bigint) => Promise<void>
  getValue: () => bigint
  toJSON: () => JSONBalanceSummary
}

export class InMemoryBalance implements Balance {
  private _balance: bigint
  private _lastMinimum: bigint
  private _lastMaximum: bigint

  constructor (initialBalance = 0n) {
    this._balance = initialBalance
  }

  async adjust (amount: bigint, minimum: bigint, maximum: bigint) {

    // Store these for status checks
    this._lastMinimum = minimum
    this._lastMaximum = maximum

    const newBalance = this._balance + amount

    if (newBalance > maximum) {
      logger.error(`exceeded maximum balance. proposedBalance=${newBalance.toString()} maximum balance=${maximum.toString()}`)
      throw new InsufficientLiquidityError('exceeded maximum balance.')
    }

    if (newBalance < minimum) {
      logger.error(`insufficient funds. oldBalance=${this._balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${minimum.toString()}`)
      throw new Error(`insufficient funds. oldBalance=${this._balance.toString()} proposedBalance=${newBalance.toString()} minimum balance=${minimum.toString()}`)
    }

    this._balance = newBalance
  }

  getValue (): bigint {
    return this._balance
  }

  toJSON (): JSONBalanceSummary {
    return {
      balance: this._balance.toString(),
      minimum: this._lastMinimum.toString(),
      maximum: this._lastMaximum.toString()
    }
  }
}
