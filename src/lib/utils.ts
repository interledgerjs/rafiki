import { createHash, randomBytes, createHmac } from 'crypto'
import { Reader } from 'oer-utils'

export const sha256 = (preimage: Buffer) => {
  return createHash('sha256').update(preimage).digest()
}

export const extractDefaultsFromSchema = (schema: any, path = '') => {
  if (typeof schema.default !== 'undefined') {
    return schema.default
  }

  switch (schema.type) {
    case 'object':
      const result = {}
      for (let key of Object.keys(schema.properties)) {
        result[key] = extractDefaultsFromSchema(schema.properties[key], path + '.' + key)
      }
      return result
    default:
      throw new Error('No default found for schema path: ' + path)
  }
}

export function uuid () {
  const random = randomBytes(16)
  random[6] = (random[6] & 0x0f) | 0x40
  random[8] = (random[8] & 0x3f) | 0x80
  return random.toString('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
}

export function hmac (secret: Buffer, message: string) {
  const hmac = createHmac('sha256', secret)
  hmac.update(message, 'utf8')
  return hmac.digest()
}

export function modifySerializedIlpPrepareAmount (prepare: Buffer, amount: bigint): Buffer {
  const reader = new Reader(prepare)
  reader.skip(1) // skip packet type
  reader.readLengthPrefix()
  const hex = amount.toString(16).padStart(8 * 2, '0').slice(0, 8 * 2)
  prepare.write(hex, reader.cursor, 8, 'hex')
  return prepare
}

export function modifySerializedIlpPrepareExpiry (prepare: Buffer, expiry: Date): Buffer {
  const EXPIRY_OFFSET = 8  // amount is 64 bit int
  const reader = new Reader(prepare)
  reader.skip(1) // skip packet type
  reader.readLengthPrefix()
  const interledgerTime = dateToInterledgerTime(expiry)
  prepare.write(interledgerTime, reader.cursor + EXPIRY_OFFSET, interledgerTime.length)
  return prepare
}

// copied from ilp-packet
function pad (n: number) {
  return n < 10
    ? '0' + n
    : String(n)
}

export function dateToInterledgerTime (date: Date): string {
  return date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5)
}
