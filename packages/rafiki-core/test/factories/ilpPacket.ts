import { Factory } from 'rosie'
import { IlpPrepare, IlpFulfill, IlpReject } from 'ilp-packet'
import { STATIC_CONDITION, STATIC_FULFILLMENT } from '../../src/constants'

function getRandomInt(min: number = 1, max: number = 100): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}

export const IlpPrepareFactory = Factory.define<IlpPrepare>('IlpPrepare').attrs({
  amount: getRandomInt().toString(),
  data: Buffer.alloc(0),
  destination: 'test.rafiki.alice',
  expiresAt: new Date(Date.now() + 10 * 1000),
  executionCondition: STATIC_CONDITION
})

export const IlpFulfillFactory = Factory.define<IlpFulfill>('IlpFulFill').attrs({
  fulfillment: STATIC_FULFILLMENT,
  data: Buffer.alloc(0)
})

export const IlpRejectFactory = Factory.define<IlpReject>('IlpReject').attrs({
  triggeredBy: 'test.connector.alice',
  code: 'F02',
  message: 'Peer unreachable',
  data: Buffer.alloc(0)
})