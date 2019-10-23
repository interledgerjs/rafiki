import { randomBytes } from 'crypto'
import { ProtocolData } from 'btp-packet/index'

export function genRequestId (): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    randomBytes(4, (err, buf) => {
      if (err) return reject(err)
      resolve(buf.readUInt32BE(0))
    })
  })
}

export function extractProtocolData (
  protocolName: string,
  protocolData: ProtocolData[]
): Buffer | null {
  const protocol = protocolData.find(
    protocol => protocol.protocolName === protocolName
  )
  return protocol ? protocol.data : null
}
