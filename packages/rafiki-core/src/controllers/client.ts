import { RafikiContext } from '../rafiki'
import { modifySerializedIlpPrepare } from '../lib'
import { sendToPeer } from '../services/client'

export function createClientController () {
  return async function ilpClient ({ state : { peers } , request, response }: RafikiContext) {
    const incomingPrepare = request.rawPrepare
    const amount = request.prepare.amountChanged ? request.prepare.intAmount : undefined
    const expiresAt = request.prepare.expiresAtChanged ? request.prepare.expiresAt : undefined
    const outgoingPrepare = modifySerializedIlpPrepare(incomingPrepare, amount, expiresAt)
    const peer = await peers.outgoing
    response.rawReply = await sendToPeer(peer, outgoingPrepare)
  }
}
