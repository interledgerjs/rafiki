import { Reader } from 'oer-utils'
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