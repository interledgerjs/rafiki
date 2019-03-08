import 'mocha'
import { StreamEndpoint, EndpointCodecs } from '../../../src/types/request-stream/stream-endpoint'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { MessageFrame } from '../../../src/types/request-stream/frame'
import { Readable, Writable, Transform, Duplex, TransformCallback } from 'stream'
import { isEndpoint } from '../../../src/types/endpoint'
const { expect } = Chai
Chai.use(chaiAsPromised)
require('source-map-support').install()

describe('StreamEndpoint', () => {

  function getCodecs(expiry = new Date(Date.now() + 300000)): EndpointCodecs<string, string> {
    return {
      isMessage: (message: any): message is MessageFrame<string, string> => true,
      encode: (payload: string) => Buffer.from(payload),
      decode: (payload: Buffer) => payload.toString(),
      isRequest: (payload: any): payload is string => {
        return payload === 'REQUEST'
      },
      nextFrameSize: (readBuffer: Buffer, cursor: number): number | undefined => {
        if (readBuffer.length - cursor >= 11) {
          return 11
        }
        return undefined
      },
      getExpiry: (request: string) => expiry
    }
  }

  function mock (stream: Duplex) {
    stream.pipe(new Transform({
      transform: (chunk: Buffer, encoding, callback: TransformCallback) => {
        try {
          expect(chunk.slice(4).toString()).to.eql('REQUEST')
          callback(undefined, Buffer.concat([
            chunk.slice(0, 4),
            Buffer.from('REPLY--')
          ]))
        } catch (e) {
          callback(e)
        }
      }
    })).pipe(stream)
  }

  describe('constructor', () => {
    it('should return an instance of an StreamEndpoint which is also a Duplex', function () {
      const endpoint = new StreamEndpoint(getCodecs())
      expect(endpoint).to.be.instanceOf(StreamEndpoint)
      expect(endpoint).to.be.instanceOf(Readable)
      expect(endpoint).to.be.instanceOf(Writable)

      expect(isEndpoint(endpoint)).to.be.true
    })
  })
  describe('sendOutgoingRequest', () => {

    it('should send a request and get back a response', async function () {
      const endpoint = new StreamEndpoint(getCodecs())
      mock(endpoint)

      try {
        const reply = await endpoint.sendOutgoingRequest('REQUEST')
        expect(reply).to.equal('REPLY--')  
      } catch (e) {
        console.error(e)
      }
    })

    it('should attempt to send a request with negative expiry and throw', async function () {
      const endpoint = new StreamEndpoint(getCodecs(new Date(0)))
      mock(endpoint)

      expect(async () => {
        await endpoint.sendOutgoingRequest('REQUEST')
      }).to.throw

      return
    })

    it('should attempt to send a request with long expiry and throw', async function () {
      const endpoint = new StreamEndpoint(getCodecs(new Date(Date.now() + 1000000)), { maxTimeoutMs: 10000 })
      mock(endpoint)

      expect(async () => {
        await endpoint.sendOutgoingRequest('REQUEST')
      }).to.throw

      return
    })

    it('should send multiple of the same request prepare and get back replies for all', async function (done) {

      this.skip()
      
      const endpoint = new StreamEndpoint(getCodecs())
      mock(endpoint)
      try {
        const replies = await Promise.all([
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
          endpoint.sendOutgoingRequest('REQUEST'),
        ])
        replies.forEach(i => expect(i).to.equal('REPLY--'))
        done()
      } catch (e) {
        done(e)
      }
    })
  })
})

