import 'mocha'
import { getReadBuffer, MessageEncoder, MessageDecoder } from '../../../src/types/request-stream/message-stream'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { MessageFrame, isMessageFrame } from '../../../src/types/request-stream/frame';
import { BufferedStream } from '../../mocks/buffered-stream'
const { expect } = Chai
Chai.use(chaiAsPromised)
require('source-map-support').install()

// getReadBuffer
describe('getReadBuffer', () => {
  it('should return the chunk if there are no more bytes to read (size:10)', () => {
    const chunk = Buffer.alloc(1)
    const cursor = 10
    const buffer = Buffer.alloc(10)
    expect(getReadBuffer(buffer, cursor, chunk)).to.be.equal(chunk)
  })
  it('should return the chunk if there are no more bytes to read (size:1)', () => {
    const chunk = Buffer.alloc(1)
    const cursor = 1
    const buffer = Buffer.alloc(1)
    expect(getReadBuffer(buffer, cursor, chunk)).to.be.equal(chunk)
  })
  it('should return the chunk if there are no more bytes to read (size:0)', () => {
    const chunk = Buffer.alloc(1)
    const cursor = 0
    const buffer = Buffer.alloc(0)
    expect(getReadBuffer(buffer, cursor, chunk)).to.be.equal(chunk)
  })
  it('should return the unread bytes if chunk is empty (cursor: 0)', () => {
    const chunk = Buffer.alloc(0)
    const cursor = 0
    const buffer = Buffer.from('1234567890')
    expect(getReadBuffer(buffer, cursor, chunk).toString()).to.be.equal(buffer.slice(cursor).toString())
  })
  it('should return the unread bytes if chunk is empty (cursor: 1)', () => {
    const chunk = Buffer.alloc(0)
    const cursor = 1
    const buffer = Buffer.from('1234567890')
    expect(getReadBuffer(buffer, cursor, chunk).toString()).to.be.equal(buffer.slice(cursor).toString())
  })
  it('should return the unread bytes if chunk is empty (cursor: 9)', () => {
    const chunk = Buffer.alloc(0)
    const cursor = 9
    const buffer = Buffer.from('1234567890')
    expect(getReadBuffer(buffer, cursor, chunk).toString()).to.be.equal(buffer.slice(cursor).toString())
  })
})

describe('Codecs', () => {
  const isRequest = (payload: any): payload is string => {
    return payload === 'REQUEST'
  }
  const isReply = (payload: any): payload is string => {
    return payload === 'REPLY--'
  }

  const codecs = {
    encode: (input: string) => {
      return Buffer.from(input)
    },
    decode: (input: Buffer) => {
      return input.toString()
    },
    isMessage: (message: any): message is MessageFrame<string, string> => {
      return isMessageFrame(message, isRequest, isReply)
    }, 
    nextFrameSize: (readBuffer: Buffer, cursor: number): number | undefined => {
      return (readBuffer.length - cursor >= 11) ? 11 : undefined
    },
    isRequest
  }


  describe('MessageEncoder', () => {
    it('should encode a message onto the stream', () => {
      const encoder = new MessageEncoder<string, string>(codecs)
      const buffer = new BufferedStream()
      encoder.pipe(buffer)
      encoder.write({ id: 1, payload: 'REQUEST'})
  
      expect(buffer.chunks[0].slice(0,4).toString('hex')).to.be.equal('00000001')
      expect(buffer.chunks[0].slice(4)).to.be.eql(Buffer.from('REQUEST'))
  
    })

    it('should throw if the message is not a valid frame', () => {
      const encoder = new MessageEncoder<string, string>(codecs)
      expect(() => {
        encoder.write({ id: 1, body: 'REQUEST'})
      }).to.throw  
    })

    it('should throw if the message has an invalid payload', () => {
      const encoder = new MessageEncoder<string, string>(codecs)
      expect(() => {
        encoder.write({ id: 1, payload: 'INVALID'})
      }).to.throw  
    })
  })

  describe('MessageDecoder', () => {
    it('should decode a message from the stream', () => {
      const decoder = new MessageDecoder<string, string>(codecs)
      const buffer = new BufferedStream({ objectMode: true })
      decoder.pipe(buffer)
      decoder.write(Buffer.from('00000001', 'hex'))
      decoder.write(Buffer.from('REQUEST'))
      
      setTimeout(() => {
        expect(buffer.chunks[0].id).to.be.equal(1)
        expect(buffer.chunks[0].payload).to.be.equal('REQUEST')  
      }, 10000)
    })

    it('should have nothing to read if less than a full frame is available', () => {
      const decoder = new MessageDecoder<string, string>(codecs)
      const buffer = new BufferedStream({ objectMode: true })
      decoder.pipe(buffer)
      decoder.write(Buffer.from('00000001', 'hex'))
      expect(buffer.chunks.length).to.be.equal(0)
      decoder.write(Buffer.from('REQ'))
      expect(buffer.chunks.length).to.be.equal(0)
      decoder.write(Buffer.from('UEST'))
      expect(buffer.chunks.length).to.be.equal(1)
    })

    it('should have one frame to read if a full frame + more is written', () => {
      const decoder = new MessageDecoder<string, string>(codecs)
      const buffer = new BufferedStream({ objectMode: true })
      decoder.pipe(buffer)
      decoder.write(Buffer.from('00000001', 'hex'))
      decoder.write(Buffer.from('REQUEST'))
      decoder.write(Buffer.from('00000002', 'hex'))
      expect(buffer.chunks.length).to.be.equal(1)
      decoder.write(Buffer.from('REQUEST'))
      expect(buffer.chunks.length).to.be.equal(2)

      expect(buffer.chunks[0].id).to.be.equal(1)
      expect(buffer.chunks[1].id).to.be.equal(2)
    })

  })
})
