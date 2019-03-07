import 'mocha'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { IlpStreamEndpoint, nextFrameSize } from '../../src/endpoints/request-stream'
import { serializeIlpPrepare, IlpPrepare, serializeIlpFulfill } from 'ilp-packet';
import { emit } from 'cluster';
const { expect } = Chai
Chai.use(chaiAsPromised)

require('source-map-support').install()

describe('IlpStreamEndpoint', () => {

  describe('constructor', () => {
    it('should create an instance of an IlpStreamEndpoint', () => {
      const stream = new IlpStreamEndpoint()
      expect(stream).to.be.instanceOf(IlpStreamEndpoint)
    })
  })
  describe('write and then read', function () {

    it('should deserialize an IlpMessage from the underlying stream and serialize the response', async function () {
      const prepare = {
        amount: '100',
        destination: 'test.test',
        expiresAt: new Date(),
        executionCondition: Buffer.alloc(32),
        data: Buffer.alloc(600)
      }
      const fulfill = {
        fulfillment: Buffer.alloc(32),
        data: Buffer.alloc(0)
      }

      const packet = serializeIlpPrepare(prepare).toString('hex')
      
      let cbCalled, handlerCalled = false

      const endpoint = new IlpStreamEndpoint({
        handler: async (request: IlpPrepare) => {
          expect(request).to.be.eql(prepare)
          handlerCalled = true
          return fulfill
        }
      })

      const cb = (error?: Error) => {
        expect(error).to.be.undefined
        cbCalled = true
      }

      const message = Buffer.from('00000001' + packet, 'hex')
      const dataPromise = new Promise<Buffer>(resolve => {
        endpoint.on('data', (data) => {
          resolve(data)
        })
      })

      await endpoint.write(message, cb)

      expect(cbCalled).to.be.true
      expect(handlerCalled).to.be.true

      const data = await dataPromise
      expect(data).to.be.instanceOf(Buffer)
      expect(data.toString('hex')).to.be.equal('00000001' + serializeIlpFulfill(fulfill).toString('hex'))
    })

    it('should handle the case where underlying stream is buffering', () => {
    })

    it('should emit an error and close when reading anything but bytes from underlying stream ', () => {
    })
  })

  describe('error', () => {
    it('should bubble up errors from the underlying stream and then close', () => {
    })
  })

  describe('close', () => {
    it('should close if underlying stream is destroyed', () => {
    })
  })
})

describe('nextFrameSize', () => {
  it('should return undefined if unread bytes is < 6', () => {
    const cursor = 0
    const buffer = Buffer.alloc(5)
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if length is > 0 and remainingBytes is < length (length: 1)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(6)
    buffer[5] = 1
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if length is > 0 and remainingBytes is < length (length: 1, cursor: 1)', () => {
    const cursor = 1
    const buffer = Buffer.alloc(7)
    buffer[6] = 1
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if length is > 0 and remainingBytes is < length (length: 6)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(11)
    buffer[5] = 6
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if length is > 0 and remainingBytes is < length (length: 127)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(128)
    buffer[5] = 123
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if (length & 0x80) > 0 and actualLength is < length (length: 1)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(6)
    buffer[5] = 0x81
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if (length & 0x80) > 0 and actualLength is < length (length: 2)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(7)
    buffer[5] = 0x82
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return 7 (buffer: 7)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(7)
    buffer[5] = 1
    expect(nextFrameSize(buffer, cursor)).to.be.equal(7)
  })

  it('should return 7 (buffer: 256)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(256)
    buffer[5] = 1
    expect(nextFrameSize(buffer, cursor)).to.be.equal(7)
  })

  it('should return 7 (cursor: 245, buffer: 256)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(256)
    buffer[5] = 1
    expect(nextFrameSize(buffer, cursor)).to.be.equal(7)
  })

  it('should return undefined for length of 128', () => {
    const cursor = 0
    const buffer = Buffer.alloc(255)
    buffer[5] = 0x80
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined for actual length < 128', () => {
    const cursor = 0
    const buffer = Buffer.alloc(255)
    buffer[5] = 0x81
    buffer[6] = 127
    expect(nextFrameSize(buffer, cursor)).to.be.undefined
  })

  it('should return 135 (headers + type + length + body)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(135)
    buffer[5] = 0x81
    buffer[6] = 128
    expect(nextFrameSize(buffer, cursor)).to.be.equal(4 + 1 + 2 + 128)
  })

  it('should return 136 (headers + type + length + body)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(136)
    buffer[5] = 0x81
    buffer[6] = 129
    expect(nextFrameSize(buffer, cursor)).to.be.equal(4 + 1 + 2 + 129)
  })

  it('should return 276 (headers + type + length + body)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(276)
    buffer[5] = 0x82
    buffer[6] = 0x01
    buffer[7] = 0x0C
    expect(nextFrameSize(buffer, cursor)).to.be.equal(4 + 1 + 3 + 268)
  })

  it('should return 65545 (headers + type + length + body)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(65545)
    buffer[5] = 0x83
    buffer[6] = 1
    buffer[7] = 0
    buffer[8] = 0
    expect(nextFrameSize(buffer, cursor)).to.be.equal(4 + 1 + 4 + 65536)
  })
})