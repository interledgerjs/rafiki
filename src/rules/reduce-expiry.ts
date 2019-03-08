import { IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Rule, IlpRequestHandler } from '../types/rule'
const { InsufficientTimeoutError } = Errors
import { log } from '../winston'
const logger = log.child({ component: 'reduce-expiry-rule' })
export interface ReduceExpiryRuleServices {
  minOutgoingExpirationWindow: number,
  minIncomingExpirationWindow: number,
  maxHoldWindow: number
}

export class ReduceExpiryRule extends Rule {

  constructor ({ minIncomingExpirationWindow, minOutgoingExpirationWindow, maxHoldWindow }: ReduceExpiryRuleServices) {
    super({
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {

        request.expiresAt = this.getDestinationExpiry(request, minOutgoingExpirationWindow, maxHoldWindow)

        return next(request)

      },
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {

        request.expiresAt = this.getDestinationExpiry(request, minIncomingExpirationWindow, maxHoldWindow)

        return next(request)

      }
    })
  }

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
