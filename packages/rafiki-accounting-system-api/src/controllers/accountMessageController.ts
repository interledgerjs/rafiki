import { log, PeerNotFoundError, STATIC_CONDITION, RafikiContext, sendToPeer } from '@interledger/rafiki-core'
import { serializeIlpPrepare, deserializeIlpReply, isReject } from 'ilp-packet';

const logger = log.child({ server: 'settlement-api', controller: 'account-message' })

export async function create (ctx: RafikiContext) {
  logger.debug('Received message to forward', { params: ctx.request.params, payload: ctx.request.body })
  
  const accountId = ctx.request.params['accountId']
  try {
    const message = Buffer.from(ctx.request.body)
    const packet = serializeIlpPrepare({
      amount: '0',
      destination: 'peer.settle',
      executionCondition: STATIC_CONDITION,
      expiresAt: new Date(Date.now() + 60000),
      data: message
    })

    const reply = deserializeIlpReply(await sendToPeer(accountId, packet, ctx.services.peers))
    if (isReject(reply)) {
      throw new Error('IlpPacket to settlement engine was rejected')
    }

    ctx.response.status = 200
    ctx.body = reply.data

  } catch (error) {
    if (error instanceof PeerNotFoundError) {
      ctx.response.status = 404
      ctx.response.message = error.message
      return
    }
    throw error
  }
}
