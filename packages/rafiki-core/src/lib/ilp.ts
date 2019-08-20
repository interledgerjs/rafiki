import { Reader } from 'oer-utils'
export function modifySerializedIlpPrepareAmount (prepare: Buffer, amount: bigint): Buffer {
  const reader = new Reader(prepare)
  reader.skip(1) // skip packet type
  reader.readLengthPrefix()
  const hex = amount.toString(16).padStart(8 * 2, '0')
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

export function modifySerializedIlpPrepare (prepare: Buffer, amount?: bigint, expiresAt?: Date): Buffer {
  if (amount || expiresAt) {
    const reader = new Reader(prepare)
    reader.skip(1) // skip packet type
    reader.readLengthPrefix()
    if (amount) {
      prepare.write(amount.toString(16).padStart(8 * 2, '0'), reader.cursor, 8, 'hex')
    } else {
      reader.skip(8)
    }
    if (expiresAt) {
      prepare.write(dateToInterledgerTime(expiresAt), reader.cursor, 17)
    }
  }
  return prepare
}

export function dateToInterledgerTime (date: Date): string {
  const pad = (n: number) => (n < 10)
      ? '0' + n
      : String(n)

  return date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5)
}
