import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {EchoProtocol} from '../../src/protocols'
import {setPipelineReader} from '../../src/types'
import {IlpFulfill, IlpPrepare, IlpReply} from 'ilp-packet'
import {Writer} from 'oer-utils'
import {InvalidPacketError} from 'ilp-packet/dist/src/errors'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
const ECHO_DATA_PREFIX = Buffer.from('ECHOECHOECHOECHO', 'ascii')
const minMessageWindow = 1000

describe('Echo protocol', async function () {

  const echoRule = new EchoProtocol({ getOwnAddress: () => 'test.connie.alice', minMessageWindow })
  const fulfillPacket = {
    fulfillment: Buffer.alloc(32),
    data: Buffer.from('test data')
  } as IlpFulfill
  const initialEchoWriter = new Writer()
  initialEchoWriter.write(ECHO_DATA_PREFIX)
  initialEchoWriter.writeUInt8(0x0)
  initialEchoWriter.writeVarOctetString(Buffer.from('test.fred.bob')) // source address
  const initialEchoData = initialEchoWriter.getBuffer()
  const responseEchoWriter = new Writer()
  responseEchoWriter.write(ECHO_DATA_PREFIX)
  responseEchoWriter.writeUInt8(0x01)
  const responseEchoData = responseEchoWriter.getBuffer()
  
  describe('outgoing channel', function () {
    it('calls next for packets that arent addressed to me', async function () {
      let nextCalled = false  
      const next = async (packet: IlpPrepare): Promise<IlpReply> => {
        nextCalled = true
        return fulfillPacket
      }
      const outgoingChannel = setPipelineReader('outgoing', echoRule, next)
      const echoPacket: IlpPrepare = {
        destination: 'test.fred',
        amount: '0',
        expiresAt: new Date(),
        data: initialEchoData,
        executionCondition: Buffer.alloc(32)
      }

      await outgoingChannel(echoPacket)

      assert.isTrue(nextCalled)
    })
    it('creates type 1 echo packet and send to the incoming channel if flag = 0', async function () {
      const outgoingChannel = setPipelineReader('outgoing', echoRule, async (packet: IlpPrepare): Promise<IlpReply> => fulfillPacket)
      const incomingChannel = setPipelineReader('incoming', echoRule, async (packet: IlpPrepare): Promise<IlpReply> => fulfillPacket)
      const incomingChannelWriteSpy = sinon.spy(echoRule.incoming, 'write')
      const expiry = new Date()
      const condition = Buffer.alloc(32)
      const echoPacket: IlpPrepare = {
        destination: 'test.connie.alice',
        amount: '0',
        expiresAt: expiry,
        data: initialEchoData,
        executionCondition: condition
      }
      const type1EchoPacket: IlpPrepare = {
        destination: 'test.fred.bob',
        amount: '0',
        expiresAt:  new Date(Number(expiry) - minMessageWindow),
        data: responseEchoData,
        executionCondition: condition
      }

      await outgoingChannel(echoPacket)

      sinon.assert.calledWith(incomingChannelWriteSpy, type1EchoPacket)
    })

    it('throws invalid packet type error if packet data does not meet minimum echo packet data length', async function () {
      const outgoingChannel = setPipelineReader('outgoing', echoRule, async (packet: IlpPrepare): Promise<IlpReply> => fulfillPacket)
      const writer = new Writer()
      writer.write(Buffer.from('tooshort'))
      const incorrectEchoPacket = {
        destination: 'test.connie.alice',
        amount: '0',
        expiresAt: new Date(),
        data: writer.getBuffer(),
        executionCondition: Buffer.alloc(32)
      }

      try {
        await outgoingChannel(incorrectEchoPacket)
      }
      catch (e) {
        assert.isTrue(e instanceof InvalidPacketError)
        assert.equal(e.message, 'packet data too short for echo request. length=8')
        return
      }
      assert.fail()
    })

    it('throws invalid packet type error if packet data does not start with echo prefix', async function () {
      const outgoingChannel = setPipelineReader('outgoing', echoRule, async (packet: IlpPrepare): Promise<IlpReply> => fulfillPacket)
      const writer = new Writer()
      writer.write(Buffer.from('NOTECHOECHOECHOECHO'))
      const incorrectEchoPacket = {
        destination: 'test.connie.alice',
        amount: '0',
        expiresAt: new Date(),
        data: writer.getBuffer(),
        executionCondition: Buffer.alloc(32)
      }

      try {
        await outgoingChannel(incorrectEchoPacket)
      }
      catch (e) {
        assert.isTrue(e instanceof InvalidPacketError)
        assert.equal(e.message, 'packet data does not start with ECHO prefix.')
        return
      }
      assert.fail()
    })

    it('throws error for unexpected echo response', async function () {
      const outgoingChannel = setPipelineReader('outgoing', echoRule, async (packet: IlpPrepare): Promise<IlpReply> => fulfillPacket)
      const unexpectedEchoPacket = {
        destination: 'test.connie.alice',
        amount: '0',
        expiresAt: new Date(),
        data: responseEchoData,
        executionCondition: Buffer.alloc(32)
      }

      try {
        await outgoingChannel(unexpectedEchoPacket)
      }
      catch (e) {
        assert.equal(e.message, 'received unexpected echo response.')
        return
      }
      assert.fail()
    })

  })
})
