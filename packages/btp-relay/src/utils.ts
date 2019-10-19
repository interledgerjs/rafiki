import { randomBytes } from 'crypto'

export function genRequestId (): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    randomBytes(4, (err, buf) => {
      if (err) return reject(err)
      resolve(buf.readUInt32BE(0))
    })
  })
}
