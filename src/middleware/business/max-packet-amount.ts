import { Errors, IlpPrepare, IlpReply, isPrepare } from 'ilp-packet'
import BigNumber from 'bignumber.js'
const { AmountTooLargeError } = Errors
import { Middleware, IlpRequestHandler } from '../../types/middleware'

export interface MaxPacketAmountMiddlewareService {
  maxPacketAmount?: string,
}

export class MaxPacketAmountMiddleware extends Middleware {
  constructor ({ maxPacketAmount }: MaxPacketAmountMiddlewareService) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler, sendCallback?: () => void): Promise<IlpReply> => {
        if (maxPacketAmount && isPrepare(request)) {
          const amount = new BigNumber(request.amount)
          if (amount.gt(maxPacketAmount)) {
            throw new AmountTooLargeError(`packet size too large. maxAmount=${maxPacketAmount} actualAmount=${request.amount}`, {
              receivedAmount: request.amount,
              maximumAmount: maxPacketAmount
            })
          }
        }
        return next(request, sendCallback)
      }
    })
  }
}
