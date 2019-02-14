// import { create as createLogger } from '../common/log'
// const log = createLogger('expire-middleware')
import { Type, Errors, IlpPrepare, IlpReply, isPrepare } from 'ilp-packet'
import Middleware, { MiddlewareCallback, Pipelines } from '../../types/middleware'
const { TransferTimedOutError } = Errors

export default class ExpireMiddleware implements Middleware {
  async applyToPipelines (pipelines: Pipelines) {
    pipelines.outgoingData.insertLast({
      name: 'expire',
      method: async (packet: IlpPrepare, next: MiddlewareCallback<IlpPrepare, IlpReply>) => {
        if (isPrepare(packet)) {
          const { executionCondition, expiresAt } = packet

          const duration = expiresAt.getTime() - Date.now()

          const promise = next(packet)

          let timeout: NodeJS.Timeout
          const timeoutPromise: Promise<IlpReply> = new Promise((resolve, reject) => {
            timeout = setTimeout(() => {
              // log.debug('packet expired. cond=%s expiresAt=%s', executionCondition.slice(0, 6).toString('base64'), expiresAt.toISOString())
              reject(new TransferTimedOutError('packet expired.'))
            }, duration)
          })

          return Promise.race([
            promise.then((data) => { clearTimeout(timeout); return data }),
            timeoutPromise
          ])
        }

        // TODO: probably don't need to check it is is a prepare packet above
        return next(packet)
      }
    })
  }
}
