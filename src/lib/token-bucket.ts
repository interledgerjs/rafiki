export default class TokenBucket {
  private _lastTime: number
  private _left: number
  private _capacity: number
  private _refillRate: number

  constructor ({ refillPeriod, refillCount, capacity }: { refillPeriod: number, refillCount: number, capacity?: number }) {
    this._lastTime = Date.now()
    this._capacity = (typeof capacity !== 'undefined') ? capacity : refillCount
    this._left = this._capacity
    this._refillRate = refillCount / refillPeriod
  }

  take (count: number = 1) {
    const now = Date.now()
    const delta = Math.max(now - this._lastTime, 0)
    const refillAmount = delta * this._refillRate

    this._lastTime = now
    this._left = Math.min(this._left + refillAmount, this._capacity)

    // this debug statement is commented out for performance, uncomment when
    // debugging rate limit middleware
    //
    // log.debug('took token from bucket. accountId=%s remaining=%s', accountId, bucket.left)

    if (this._left < count) {
      return false
    }

    this._left -= count
    return true
  }
}
