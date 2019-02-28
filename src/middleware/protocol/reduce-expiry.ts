import { IlpPrepare, IlpReply, Errors } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
const { InsufficientTimeoutError } = Errors

export interface ReduceExpiryMiddlewareServices {
  minOutgoingExpirationWindow: number,
  minIncomingExpirationWindow: number,
  maxHoldWindow: number
}

export class ReduceExpiryMiddleware extends Middleware {

  constructor ({ minIncomingExpirationWindow, minOutgoingExpirationWindow, maxHoldWindow }: ReduceExpiryMiddlewareServices) {
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
      throw new InsufficientTimeoutError('source transfer has already expired. sourceExpiry=' + request.expiresAt.toISOString() + ' currentTime=' + (new Date().toISOString()))
    }

    const maxHoldTime = Date.now() + maxHoldWindow
    const expectedDestinationExpiryTime = sourceExpiryTime - minExpirationWindow
    const destinationExpiryTime = Math.min(expectedDestinationExpiryTime, maxHoldTime)

    if (destinationExpiryTime < Date.now() + minExpirationWindow) {
      throw new InsufficientTimeoutError('source transfer expires too soon to complete payment. actualSourceExpiry=' + request.expiresAt.toISOString() + ' requiredSourceExpiry=' + (new Date(Date.now() + 2 * minExpirationWindow).toISOString()) + ' currentTime=' + (new Date().toISOString()))
    }

    return new Date(destinationExpiryTime)
  }
}
