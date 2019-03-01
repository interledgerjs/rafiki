import { Errors, IlpPrepare, IlpReply, isPrepare } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { log } from '../../winston'
const logger = log.child({ component: 'expire-middleware' })

const { AmountTooLargeError } = Errors

export interface MaxPacketAmountMiddlewareService {
  maxPacketAmount?: bigint,
}

export class MaxPacketAmountMiddleware extends Middleware {
  constructor ({ maxPacketAmount }: MaxPacketAmountMiddlewareService) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (maxPacketAmount && isPrepare(request)) {
          const amount = BigInt(request.amount)
          if (amount > maxPacketAmount) {
            logger.warn('rejected a packet due to amount exceeding maxPacketAmount', { maxPacketAmount, request })
            throw new AmountTooLargeError(`packet size too large. maxAmount=${maxPacketAmount} actualAmount=${request.amount}`, {
              receivedAmount: request.amount,
              maximumAmount: maxPacketAmount.toString()
            })
          }
        }
        return next(request)
      }
    })
  }
}
