import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { IldcpProtocol, IldcpProtocolServices } from '../../src/protocols/ildcp'
import { IlpPrepare, IlpFulfill, serializeIlpFulfill, IlpReply, deserializeIlpReply } from 'ilp-packet'
import * as ILDCP from 'ilp-protocol-ildcp'
import { PeerInfo } from '../../src/types/peer'
import { setPipelineReader } from '../../src/types/rule'
import { MockIlpEndpoint } from '../mocks/mockIlpEndpoint'

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('ILDCP Rule', function () {
  let ildcpStub: sinon.SinonStub
  let ildcpServices: IldcpProtocolServices

  const IlpFulfill = {
    fulfillment: Buffer.alloc(32),
    data: Buffer.from('test data')
  }
  const peerConfigPacket: IlpPrepare = {
    amount: '100',
    executionCondition: Buffer.alloc(32),
    expiresAt: new Date(),
    destination: 'peer.config',
    data: Buffer.alloc(0)
  }
  const peerInfo: PeerInfo = {
    id: 'alice',
    relation: 'child',
    assetScale: 2,
    assetCode: 'TEST',
    rules: [],
    protocols: [
      {
        'name': 'ildcp',
      }
    ]
  }
  beforeEach(async function () {
    ildcpServices = {
      getPeerInfo: () => peerInfo
      ,
      getOwnAddress: () => 'test.connie'
    }
  })

  afterEach(function () {
    if(ildcpStub) {
      ildcpStub.restore()
    }
  })

  it('does not make an ILDCP serve request and calls next if not handling a peer.config message', async function () {
    const IlpFulfill: IlpFulfill = {
      fulfillment: Buffer.alloc(32),
      data: Buffer.from('test data')
    }
    const packet: IlpPrepare = {
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      destination: 'test.connie',
      data: Buffer.alloc(0)
    }
    let didNextGetCalled: boolean = false
    const ildcpRule = new IldcpProtocol(ildcpServices)
    const sendIncoming = setPipelineReader('incoming', ildcpRule, async (packet: IlpPrepare) => {
      didNextGetCalled = true
      return IlpFulfill
    })
    ildcpStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await sendIncoming(packet)

    assert.isTrue(didNextGetCalled)
    assert.isFalse(ildcpStub.called)
  })

  it('makes an ILDCP serve request and does not call next if handling a peer.config message', async function () {
    const ildcpRule = new IldcpProtocol(ildcpServices)
    const sendIncoming = setPipelineReader('incoming', ildcpRule, async (packet: IlpPrepare) => {
      throw new Error('shouldn\'t call next')
    })

    ildcpStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await sendIncoming(peerConfigPacket)

    assert.isTrue(ildcpStub.called)
  })

  it('uses getPeerInfo service to provide information for peer.config messages', async function () {
    const getPeerInfoSpy = sinon.spy(ildcpServices, 'getPeerInfo')
    ildcpStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))
    const ildcpRule = new IldcpProtocol(ildcpServices)

    const sendIncoming = setPipelineReader('incoming', ildcpRule, async () => IlpFulfill)
    await sendIncoming(peerConfigPacket)

    sinon.assert.calledOnce(getPeerInfoSpy)
  })

  it('throws error if peer relation is not a child', async function () {
    let peer: PeerInfo = {...peerInfo, relation: "peer"}
    const ildcpRule = new IldcpProtocol({
      getPeerInfo: () => peer,
      getOwnAddress: () => 'test.connie'
    })
    const sendIncoming = setPipelineReader('incoming', ildcpRule, async () => IlpFulfill)

    try {
      await sendIncoming(peerConfigPacket)
    } catch (e) {
      assert.equal(e.message, 'Can\'t generate address for a peer that isn\t a child.')
      return
    }

    assert.fail("Did not throw expected error")
  })

  describe('getAddressFrom', function () {
    it('throws error if the returned client address is unknown', async function () {
      const ildcpResponse = {
        clientAddress: 'unknown',
        assetCode: 'USD',
        assetScale: 2
      } as ILDCP.IldcpResponse
      const parentEndpoint = new MockIlpEndpoint(async (packet: IlpPrepare): Promise<IlpReply> => deserializeIlpReply(ILDCP.serializeIldcpResponse(ildcpResponse)))
      const ildcpRule = new IldcpProtocol(ildcpServices)

      try{
        await ildcpRule.getAddressFrom(parentEndpoint)
      } catch (e) {
        assert.equal(e.message, "Failed to get ILDCP address from parent.")
        return
      }
      assert.fail()
    })

    it('returns client address', async function () {
      const ildcpResponse = {
        clientAddress: 'test.fred',
        assetCode: 'USD',
        assetScale: 2
      } as ILDCP.IldcpResponse
      const parentEndpoint = new MockIlpEndpoint(async (packet: IlpPrepare): Promise<IlpReply> => deserializeIlpReply(ILDCP.serializeIldcpResponse(ildcpResponse)))
      const ildcpRule = new IldcpProtocol(ildcpServices)

      const address = await ildcpRule.getAddressFrom(parentEndpoint)

      assert.equal(address, 'test.fred')
    })
  })
})