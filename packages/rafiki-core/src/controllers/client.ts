import { RafikiContext } from '../rafiki'
import { modifySerializedIlpPrepareAmount } from '../lib'
import { sendToPeer } from '../services/client'

export function createClientController () {
  return async function ilpClient ({ services: { peers }, state , request, response }: RafikiContext) {
    const buffer = request.rawPrepare
    if (request.body.isAmountChanged) {
      modifySerializedIlpPrepareAmount(buffer, request.body.intAmount)
    }
    if (request.body.isExpiresAtChanged) {
      modifySerializedIlpPrepareAmount(buffer, request.body.expiresAt)
    }
    const peer = await state.peers.outgoing
    response.rawReply = await sendToPeer(peer, buffer)
  }
}
