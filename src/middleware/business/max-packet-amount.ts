import { Errors, IlpPrepare, IlpReply, isPrepare } from 'ilp-packet'
import BigNumber from 'bignumber.js'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { log } from '../../winston'
const logger = log.child({ component: 'expire-middleware' })

const { AmountTooLargeError } = Errors

export interface MaxPacketAmountMiddlewareService {
  maxPacketAmount?: string,
}

export class MaxPacketAmountMiddleware extends Middleware {
  constructor ({ maxPacketAmount }: MaxPacketAmountMiddlewareService) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (maxPacketAmount && isPrepare(request)) {
          const amount = new BigNumber(request.amount)
          logger.warn('rejected a packet due to amount exceeding maxPacketAmount', { maxPacketAmount, request })
          if (amount.gt(maxPacketAmount)) {
            throw new AmountTooLargeError(`packet size too large. maxAmount=${maxPacketAmount} actualAmount=${request.amount}`, {
              receivedAmount: request.amount,
              maximumAmount: maxPacketAmount
            })
          }
        }
        return next(request)
      }
    })
  }
}
