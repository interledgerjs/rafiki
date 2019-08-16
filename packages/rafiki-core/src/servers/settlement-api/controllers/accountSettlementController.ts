import { AppContext } from '..'
import { log } from '../../../logger'
import { PeerNotFoundError } from '../../../errors'

const logger = log.child({ component: 'settlement-admin-api:accountSettlementController' })

export async function create (ctx: AppContext) {
  logger.debug('Received settlement', { params: ctx.request.params, payload: ctx.request.body })
  const accountId = ctx.request.params['accountId']

  try {
    await ctx.updateAccountBalance(accountId, -BigInt(ctx.request.body['amount']), ctx.request.body['scale'])
    ctx.response.status = 200
  } catch (error) {
    if (error instanceof PeerNotFoundError) {
      ctx.response.status = 404
      ctx.response.message = error.message
      return
    }
    throw error
  }
}
