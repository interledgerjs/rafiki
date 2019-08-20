import { RafikiContext } from "@interledger/rafiki-core"
import { deserializeIlpPrepare, IlpFulfill, serializeIlpFulfill } from "ilp-packet"

/**
 * Client that returns a fulfill packet where the fulfillment is the condition from the incoming prepare packet
 */
export function createFulfillClientController () {
  return async function ilpClient ({ services: { peers }, state , request, response }: RafikiContext) {
    const buffer = request.rawPrepare
    // the fulfillment is stored in the data
    const { data } = deserializeIlpPrepare(buffer)

    const fulfill: IlpFulfill = {
      fulfillment: data,
      data: Buffer.alloc(0)
    }

    response.rawReply = serializeIlpFulfill(fulfill)
  }
}
