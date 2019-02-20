import { Errors, IlpPrepare, IlpReply, isPrepare } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
const { TransferTimedOutError } = Errors

export class ExpireMiddleware extends Middleware {

  constructor () {
    super({
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        if (isPrepare(request)) {
          const { expiresAt } = request

          const duration = expiresAt.getTime() - Date.now()

          const promise = next(request)

          let timeout: NodeJS.Timeout
          const timeoutPromise: Promise<IlpReply> = new Promise((resolve, reject) => {
            timeout = setTimeout(() => {
              reject(new TransferTimedOutError('packet expired.'))
            }, duration)
          })

          return Promise.race([
            promise.then((data) => { clearTimeout(timeout); return data }),
            timeoutPromise
          ])
        }

        // TODO: probably don't need to check it is is a prepare packet above
        return next(request)
      }
    })
  }
}
