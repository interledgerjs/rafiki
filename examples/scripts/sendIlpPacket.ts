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
  const ilpPacketBuffer = await axios.post('http://localhost:3000', serializeIlpPrepare(prepare), {
    headers: {
      'content-type': 'application/octet-stream',
      'authorization': 'Bearer ' + 'alice'
    }
  }).then((resp: any) => resp.data)
    .catch((error: any) => {
      console.log(error.response)
    })

  console.log('received ilpReply', deserializeIlpReply(ilpPacketBuffer))
}

run().catch(error => console.log('error', error))
