import axios from 'axios'
import { deserializeIlpReply, IlpPrepare, serializeIlpPrepare } from 'ilp-packet'
import { STATIC_CONDITION } from '../../packages/rafiki-core/src'

async function run () {
  const prepare: IlpPrepare = {
    amount: '1',
    data: Buffer.alloc(0),
    destination: 'g.merchant',
    executionCondition: STATIC_CONDITION,
    expiresAt: new Date()
  }
  const response = await axios.post<Buffer>('http://localhost:3000/', serializeIlpPrepare(prepare), {
    headers: {
      'content-type': 'application/octet-stream',
      'authorization': 'Bearer ' + 'alice'
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
