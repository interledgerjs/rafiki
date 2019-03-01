import { createHash } from 'crypto'

export const MAX_UINT_64 = 0xFFFFFFFFFFFFFFFFn
export const MIN_INT_64 = -9223372036854775808n
export const MAX_INT_64 = 9223372036854775807n
export const STATIC_FULFILLMENT = Buffer.alloc(32)
export const STATIC_CONDITION = createHash('SHA256').update(STATIC_FULFILLMENT).digest()
