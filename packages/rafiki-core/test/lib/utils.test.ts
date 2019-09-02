import { serializeIlpPrepare, deserializeIlpPrepare } from 'ilp-packet'
import { IlpPrepareFactory } from '../../src/factories'
import { modifySerializedIlpPrepareAmount, modifySerializedIlpPrepareExpiry } from '../../src/lib'

describe('modifySerializedIlpPrepareAmount', () => {
  it('can modify the amount for a length indicator that is not longer than 1 byte', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '10' })

    const modifiedPrepare = modifySerializedIlpPrepareAmount(serializeIlpPrepare(prepare), 5n)

    expect(deserializeIlpPrepare(modifiedPrepare).amount).toBe('5')
  })

  it('can modify the amount for a length indicator that is longer than 1 byte', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '10', data: Buffer.alloc(256) })

    const modifiedPrepare = modifySerializedIlpPrepareAmount(serializeIlpPrepare(prepare), 5n)

    expect(deserializeIlpPrepare(modifiedPrepare).amount).toBe('5')
  })
})

describe('modifySerializedIlpPrepareExpiry', () => {
  const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

  it('can modify the expiry for a length indicator that is not longer than 1 byte', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '10', expiresAt: new Date(START_DATE) })

    const modifiedPrepare = modifySerializedIlpPrepareExpiry(serializeIlpPrepare(prepare), new Date(START_DATE + 10 * 1000))

    expect(deserializeIlpPrepare(modifiedPrepare).expiresAt).toEqual(new Date(START_DATE + 10 * 1000))
  })

  it('can modify the expiry for a length indicator that is longer than 1 byte', async () => {
    const prepare = IlpPrepareFactory.build({ amount: '10', data: Buffer.alloc(256), expiresAt: new Date(START_DATE) })

    const modifiedPrepare = modifySerializedIlpPrepareExpiry(serializeIlpPrepare(prepare), new Date(START_DATE + 10 * 1000))

    expect(deserializeIlpPrepare(modifiedPrepare).expiresAt).toEqual(new Date(START_DATE + 10 * 1000))
  })
})
