import { Errors, IlpPrepare, IlpReply, isPrepare } from 'ilp-packet'
// import { create as createLogger } from '../common/log'
// const log = createLogger('max-packet-amount-middleware')
import BigNumber from 'bignumber.js'
const { AmountTooLargeError } = Errors
import Middleware, { MiddlewareCallback, MiddlewareServices, Pipelines } from '../../types/middleware'
import { PeerInfo } from '../../types/peer'

export interface MaxPacketAmountMiddlewareService extends MiddlewareServices {
  maxPacketAmount: string,
  peerId: string
}

export default class MaxPacketAmountMiddleware implements Middleware {

  private maxPacketAmount: string
  private peerId: string

  constructor ({ maxPacketAmount, peerId }: MaxPacketAmountMiddlewareService) {
    this.maxPacketAmount = maxPacketAmount
    this.peerId = peerId
  }

  async applyToPipelines (pipelines: Pipelines) {
    if (this.maxPacketAmount) {
      pipelines.incomingData.insertLast({
        name: 'maxPacketAmount',
        method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
          if (isPrepare(packet)) {
            const amount = new BigNumber(packet.amount)
            if (amount.gt(this.maxPacketAmount)) {
              // log.debug('rejecting packet for exceeding max amount. accountId=%s maxAmount=%s actualAmount=%s', accountId, maxPacketAmount, parsedPacket.amount)
              throw new AmountTooLargeError(`packet size too large. maxAmount=${this.maxPacketAmount} actualAmount=${packet.amount}`, {
                receivedAmount: packet.amount,
                maximumAmount: this.maxPacketAmount
              })
            }
          }

          return next(packet)
        }
      })
    }

  }
}
