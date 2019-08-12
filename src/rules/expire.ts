import { Errors, IlpPrepare, IlpReply } from 'ilp-packet'
import { Rule, IlpRequestHandler } from '../types/rule'
import { log } from '../winston'
const logger = log.child({ component: 'expire-rule' })

const { TransferTimedOutError } = Errors

export class ExpireRule extends Rule {

  constructor () {
    super({
      outgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
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
