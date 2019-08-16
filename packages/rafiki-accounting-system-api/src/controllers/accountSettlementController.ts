import { log, PeerNotFoundError, RafikiContext, AccountSnapshot } from '@interledger/rafiki-core'

const logger = log.child({ server: 'settlement-api', controller: 'account-settlement' })

export async function create ({ services: { peers, accounts }, request: { params, body }, response }: RafikiContext) {
  
  logger.debug('Received settlement', { params , body })
  
  const id = params['id']
  const amount = -BigInt(body['amount'])
  const scale = +body['scale']

  try {
      const account = await getAccountBySettlementId(id)
      const scaleDiff = account.assetScale - scale
  
      // TODO: update to check whether scaledAmountDiff is an integer
      if (scaleDiff < 0) {
        // TODO: should probably throw an error
        // logger.warn('Could not adjust balance due to scale differences', { amountDiff, scale })
        return
      }

      const scaleRatio = Math.pow(10, scaleDiff)
      const scaledAmountDiff = amount * BigInt(scaleRatio)
      await accounts.adjustBalance(scaledAmountDiff, account.peerId, account.id)
      response.status = 200
  } catch (error) {
    if (error instanceof PeerNotFoundError) {
      response.status = 404
      response.message = error.message
      return
    }
    throw error
  }
}

// TODO: Implement mapping between settlement engine id and accounting system id
function getAccountBySettlementId(id: string): AccountSnapshot {
  throw new Error('not implemented')
}
