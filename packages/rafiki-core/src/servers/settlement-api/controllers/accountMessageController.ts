import { AppContext } from '..'
import { log } from '../../../logger'
import { PeerNotFoundError } from '../../../errors'

const logger = log.child({ component: 'settlement-admin-api:accountMessageController' })

export async function create (ctx: AppContext) {
  logger.debug('Received message to forward', { params: ctx.request.params, payload: ctx.request.body })
  const accountId = ctx.request.params['accountId']

  try {
    const bufferMessage = Buffer.from(ctx.request.body)
    const sendMessage = ctx.sendMessage
    const data = await sendMessage(accountId, bufferMessage)
    ctx.response.status = 200
    ctx.body = data
  } catch (error) {
    if (error instanceof PeerNotFoundError) {
      ctx.response.status = 404
      ctx.response.message = error.message
      return
    }
    throw error
  }
}
