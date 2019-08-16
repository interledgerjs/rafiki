import { IlpPrepare, Errors } from 'ilp-packet'
import { log } from '../logger'
import { RafikiContext } from '../rafiki'
const { InsufficientTimeoutError } = Errors
const logger = log.child({ middleware: 'reduce-expiry' })

/**
 * Reduces the expiry of the. This is done on the incoming and outgoing pipelines so it can be adjusted per peer.
 * This middleware should be BEFORE the expiry time check.
 *
 * // TODO: Should we reduce the expiry on the packet or just expire the packet?
 * // TODO: Maybe this should be combined with the expiry checker and the expiry timeout?
 */
export function createIncomingReduceExpiryMiddleware () {
  return async ({ ilp, state: { peers } }: RafikiContext, next: () => Promise<any>) => {
    const { minOutgoingExpirationWindow, maxHoldWindow } = await peers.incoming
    // TODO: Validate this logic. Do we want to change the expiry on the incoming packet?
    // This is now (correctly?) a read-only object
    ilp.prepare.expiresAt = getDestinationExpiry(ilp.prepare, minOutgoingExpirationWindow || 1000, maxHoldWindow || 30000)
    await next()
  }
}

export function createOutgoingReduceExpiryMiddleware () {
  return async ({ ilp, state: { peers } }: RafikiContext, next: () => Promise<any>) => {
    const { minOutgoingExpirationWindow, maxHoldWindow } = await peers.outgoing
    // TODO: These values should not be undefined. The defaults should be set in the service
    ilp.outgoingPrepare.expiresAt = getDestinationExpiry(ilp.prepare, minOutgoingExpirationWindow || 1000, maxHoldWindow || 30000)
    await next()
  }
}

/**
 * Calculates a new expiry time for the prepare based on the minimum expiration and maximum hold time windows.
 * @param request The incoming prepare packet
 * @param minExpirationWindow The amount to reduce the request's expiry by in milliseconds
 * @param maxHoldWindow The maximum time window (in milliseconds) that the connector is willing to place funds on hold while waiting for the outcome of a transaction
 * @throws {InsufficientTimeoutError} Throws if the new expiry time is less than the minimum expiration time window or the prepare has already expired.
 */
function getDestinationExpiry (request: IlpPrepare, minExpirationWindow: number, maxHoldWindow: number): Date {
  const sourceExpiryTime = request.expiresAt.getTime()

  if (sourceExpiryTime < Date.now()) {
    logger.verbose('incoming packet has already expired', { request })
    throw new InsufficientTimeoutError('source transfer has already expired.'
    + ' sourceExpiry=' + request.expiresAt.toISOString() + ' currentTime=' + (new Date().toISOString()))
  }

  const maxHoldTime = Date.now() + maxHoldWindow
  const expectedDestinationExpiryTime = sourceExpiryTime - minExpirationWindow
  const destinationExpiryTime = Math.min(expectedDestinationExpiryTime, maxHoldTime)

  if (destinationExpiryTime < Date.now() + minExpirationWindow) {
    logger.verbose('incoming packet expires too soon to complete payment', { request })
    throw new InsufficientTimeoutError('source transfer expires too soon to complete payment.'
    + ' actualSourceExpiry=' + request.expiresAt.toISOString()
    + ' requiredSourceExpiry=' + (new Date(Date.now() + 2 * minExpirationWindow).toISOString())
    + ' currentTime=' + (new Date().toISOString()))
  }

  return new Date(destinationExpiryTime)
}
