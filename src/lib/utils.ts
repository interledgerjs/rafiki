import { createHash, randomBytes, createHmac } from 'crypto'

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
