import { Errors, IlpPrepare, IlpReply, isPrepare } from 'ilp-packet'
import { Middleware, IlpRequestHandler } from '../../types/middleware'
import { log } from '../../winston'
const logger = log.child({ component: 'expire-middleware' })

const { TransferTimedOutError } = Errors

export class ExpireMiddleware extends Middleware {

  constructor () {
    super({
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        const { expiresAt } = request

        const duration = expiresAt.getTime() - Date.now()

        const promise = next(request)

        let timeout: NodeJS.Timeout
        const timeoutPromise: Promise<IlpReply> = new Promise((resolve, reject) => {
          timeout = setTimeout(() => {
            logger.debug('packet expired', { request })
            reject(new TransferTimedOutError('packet expired.'))
          }, duration)
        })

        return Promise.race([
          promise.then((data) => { clearTimeout(timeout); return data }),
          timeoutPromise
        ])
      }
    })
  }
}
