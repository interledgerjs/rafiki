import { IlpPrepare, Errors } from 'ilp-packet'
import { Rule } from '../types/rule'
import { log } from '../winston'
const { InsufficientTimeoutError } = Errors
const logger = log.child({ component: 'reduce-expiry-rule' })

export interface ReduceExpiryRuleServices {
  minOutgoingExpirationWindow: number,
  minIncomingExpirationWindow: number,
  maxHoldWindow: number
}

/**
 * Reduces the expiry of the. This is done on the incoming and outgoing pipelines so it can be adjusted per peer.
 */
export class ReduceExpiryRule extends Rule {

  constructor ({ minIncomingExpirationWindow, minOutgoingExpirationWindow, maxHoldWindow }: ReduceExpiryRuleServices) {
    super({
      incoming: async ({ state: { ilp } }, next) => {
        // TODO: Validate this logic. Do we want to change the expiry on the incoming packet?
        ilp.req.expiresAt = this.getDestinationExpiry(ilp.req, minIncomingExpirationWindow, maxHoldWindow)
        await next()
      },
      outgoing: async ({ state: { ilp } }, next) => {
        ilp.outgoingExpiry = this.getDestinationExpiry(ilp.req, minOutgoingExpirationWindow, maxHoldWindow)
        await next()
      }
    })
  }

  /**
   * Calculates a new expiry time for the prepare based on the minimum expiration and maximum hold time windows.
   * @param request The incoming prepare packet
   * @param minExpirationWindow The amount to reduce the request's expiry by in milliseconds
   * @param maxHoldWindow The maximum time window (in milliseconds) that the connector is willing to place funds on hold while waiting for the outcome of a transaction
   * @throws {InsufficientTimeoutError} Throws if the new expiry time is less than the minimum expiration time window or the prepare has already expired.
   */
  getDestinationExpiry (request: IlpPrepare, minExpirationWindow: number, maxHoldWindow: number): Date {
    const sourceExpiryTime = request.expiresAt.getTime()

    if (sourceExpiryTime < Date.now()) {
      logger.verbose('incoming packet has already expired', { request })
      throw new InsufficientTimeoutError('source transfer has already expired. sourceExpiry=' + request.expiresAt.toISOString() + ' currentTime=' + (new Date().toISOString()))
    }

    const maxHoldTime = Date.now() + maxHoldWindow
    const expectedDestinationExpiryTime = sourceExpiryTime - minExpirationWindow
    const destinationExpiryTime = Math.min(expectedDestinationExpiryTime, maxHoldTime)

    if (destinationExpiryTime < Date.now() + minExpirationWindow) {
      logger.verbose('incoming packet expires too soon to complete payment', { request })
      throw new InsufficientTimeoutError('source transfer expires too soon to complete payment. actualSourceExpiry=' + request.expiresAt.toISOString() + ' requiredSourceExpiry=' + (new Date(Date.now() + 2 * minExpirationWindow).toISOString()) + ' currentTime=' + (new Date().toISOString()))
    }

    return new Date(destinationExpiryTime)
  }
}
