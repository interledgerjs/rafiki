import { log } from '../winston'
const logger = log.child({ component: 'token-bucket' })
export class TokenBucket {
  private _lastTime: number
  private _left: bigint
  private _capacity: bigint
  private _refillRate: bigint

  constructor ({ refillPeriod, refillCount, capacity }: { refillPeriod: number, refillCount: bigint, capacity?: bigint }) {
    this._lastTime = Date.now()
    this._capacity = (typeof capacity !== 'undefined') ? capacity : refillCount
    this._left = this._capacity
    this._refillRate = refillCount / BigInt(refillPeriod)
  }

  take (count: bigint = 1n) {
    const now = Date.now()
    const delta = Math.max(now - this._lastTime, 0)
    const refillAmount = BigInt(delta) * this._refillRate

    this._lastTime = now
    this._left = (this._left + refillAmount < this._capacity) ? this._left + refillAmount : this._capacity

    // this debug statement is commented out for performance, uncomment when
    // debugging rate limit middleware
    // logger.silly('took token from bucket',{ left: this._left })

    if (this._left < count) {
      return false
    }

    this._left -= count
    return true
  }
}
