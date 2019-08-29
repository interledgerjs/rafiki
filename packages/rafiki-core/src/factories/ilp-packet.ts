import { Factory } from 'rosie'
import { IlpPrepare, IlpFulfill, IlpReject } from 'ilp-packet'
import { STATIC_CONDITION, STATIC_FULFILLMENT } from '../../src/constants'
import faker from 'faker'

export const IlpPrepareFactory = Factory.define<IlpPrepare>('IlpPrepare').attrs({
  amount: faker.finance.amount(1, 100, 0),
  data: Buffer.alloc(0),
  destination: 'test.rafiki.' + faker.name.firstName(),
  expiresAt: new Date(Date.now() + 10 * 1000),
  executionCondition: STATIC_CONDITION
})

export const IlpFulfillFactory = Factory.define<IlpFulfill>('IlpFulFill').attrs({
  fulfillment: STATIC_FULFILLMENT,
  data: Buffer.alloc(0)
})

export const IlpRejectFactory = Factory.define<IlpReject>('IlpReject').attrs({
  triggeredBy: 'test.rafiki.' + faker.name.firstName(),
  code: 'F02',
  message: 'Peer unreachable',
  data: Buffer.alloc(0)
})
