import { createHash } from 'crypto'

export const STATIC_FULFILLMENT = Buffer.alloc(32)
export const STATIC_CONDITION = createHash('SHA256').update(STATIC_FULFILLMENT).digest()
