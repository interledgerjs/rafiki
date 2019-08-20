import axios from 'axios'
import { deserializeIlpReply, IlpPrepare, serializeIlpPrepare } from 'ilp-packet'
import { STATIC_CONDITION } from '../packages/rafiki-core/src'

async function run () {
  const prepare: IlpPrepare = {
    amount: '1',
    data: Buffer.alloc(0),
    destination: 'g.whatever',
    executionCondition: STATIC_CONDITION,
    expiresAt: new Date()
  }
  const response = await axios.post<Buffer>('http://localhost:3000/', serializeIlpPrepare(prepare), {
    headers: {
      'accept': 'application/octet-stream',
      'content-type': 'application/octet-stream',
      'authorization': 'Bearer ' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3RpdmUiOnRydWUsInN1YiI6ImFsaWNlIiwiaWF0IjoxNTE2MjM5MDIyfQ.nkVOy2hw_zfZ1Erjyg1E5qACjuZ2-0wd2C-i7TAH98U'
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
