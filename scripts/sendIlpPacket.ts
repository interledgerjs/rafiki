import axios from 'axios'
import { deserializeIlpReply, IlpPrepare, serializeIlpPrepare } from 'ilp-packet'
import { STATIC_CONDITION } from '../packages/rafiki-core/src'

async function run () {
  const prepare: IlpPrepare = {
    amount: '1',
    data: Buffer.alloc(0),
    destination: 'test.harry',
    executionCondition: STATIC_CONDITION,
    expiresAt: new Date(Date.now() + 60000)
  }
  const response = await axios.post<Buffer>('http://localhost:3000/', serializeIlpPrepare(prepare), {
    headers: {
      accept: 'application/octet-stream',
      'content-type': 'application/octet-stream',
      authorization: 'Bearer ' + 'oKIn6krL65uO2-FEQjYVAkYuI9nUTLbAy5SNxj4KQwA.n_-qgK0SZVFspLAuiW7R6JVLMwCBdV25RAq3TtHC_0M'
    },
    responseType: 'arraybuffer'
  })

  if (response) {
    console.log('received ilpReply', deserializeIlpReply(response.data))
  } else {
    console.error('no reply received')
  }

}
run().catch(console.error)
