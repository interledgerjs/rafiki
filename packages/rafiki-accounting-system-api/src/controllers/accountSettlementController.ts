import { PeerNotFoundError, AccountNotFoundError, RafikiContext, AccountSnapshot } from '@interledger/rafiki-core'

export async function create ({ services: { accounts, peers }, request: { params, body }, response }: RafikiContext) {

  const peerId = params['peerId']
  const amount = -BigInt(body['amount'])
  const scale = +body['scale']

  try {
    const account = await accounts.get(peerId)
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
    if (error instanceof PeerNotFoundError || error instanceof AccountNotFoundError) {
      response.status = 404
      response.message = error.message
      return
    }
    throw error
  }
}
