import 'mocha'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { deserializeMessageFrame, isMessageFrame, serializeMessageFrame } from '../../../src/types/request-stream/frame'
const { assert, expect } = Chai
Chai.use(chaiAsPromised)
require('source-map-support').install()


describe('MessageFrame', () => {

  const isRequest = (payload: any): payload is string => payload === 'REQUEST'
  const isReply = (payload: any): payload is string => payload === 'REPLY'

  describe('isMessageFrame', () => {
    it('should check if the supplied object is a message frame', () => {
      const frame = {
        id: 1,
        payload: 'REQUEST'
      }
      expect(isMessageFrame<string, string>(frame, isRequest, isReply)).to.be.true
    })
    it('should fail if the supplied object has an invalid payload', () => {
      const frame = {
        id: 1,
        payload: 'OTHER'
      }
      expect(isMessageFrame<string, string>(frame, isRequest, isReply)).to.be.false
    })
    it('should fail if the supplied object is invalid', () => {
      const frame = {
        id: 'TEST',
        payload: 'REQUEST'
      }
      expect(isMessageFrame<string, string>(frame, isRequest, isReply)).to.be.false
    })
  })
  describe('deserializeMessageFrame', () => {
    it('should deserialize a frame', () => {
      const payload = Buffer.from('PAYLOAD').toString('hex')
      const buffer = Buffer.from('00000001' + payload, 'hex')
      const result = deserializeMessageFrame<string, string>(buffer, payload => Buffer.from(payload).toString())
      assert.deepEqual(result, {
        id: 1,
        payload: 'PAYLOAD'
      })
    })

  })

  describe('serializeMessageFrame', () => {
    it('should serialize a frame', () => {
      const frame = {
        id: 1,
        payload: 'PAYLOAD'
      }
      const payload = Buffer.from(frame.payload).toString('hex')
      const result = serializeMessageFrame<string, string>(frame, payload => Buffer.from(payload))
      assert.deepEqual(result.toString('hex'), '00000001' + payload)
    })
  })

})

