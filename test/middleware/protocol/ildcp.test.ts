import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { IldcpMiddleware } from '../../../src/middleware/protocol/ildcp'
import { IlpPrepare, IlpFulfill, serializeIlpFulfill } from 'ilp-packet';
import * as ILDCP from 'ilp-protocol-ildcp'
import { PeerInfo } from '../../../src/types/peer';
import { setPipelineReader } from '../../../src/types/middleware';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('ILDCP Middleware', function () {

  let ildcpMiddleware: IldcpMiddleware
  let ildcpStub: sinon.SinonStub

  const ildcpServices = {
    getPeerInfo: () => {
      return {
        'id': 'alice',
        'relation': 'peer',
        'assetScale': 2,
        'assetCode': 'TEST'
      } as PeerInfo
    },
    getOwnAddress: () => 'test.connie',
    getPeerAddress: () => 'test.connie.alice'
  }

  beforeEach(async function () {
    ildcpMiddleware = new IldcpMiddleware(ildcpServices)
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
    const sendIncoming = setPipelineReader('incoming', ildcpMiddleware, async (packet: IlpPrepare) => {
      didNextGetCalled = true
      return IlpFulfill
    })
    ildcpStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await sendIncoming(packet)

    assert.isTrue(didNextGetCalled)
    assert.isFalse(ildcpStub.called)
  })

  it('makes an ILDCP serve request and does not call next if handling a peer.config message', async function () {
    const IlpFulfill = {
      fulfillment: Buffer.alloc(32),
      data: Buffer.from('test data')
    }
    const packet: IlpPrepare = {
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      destination: 'peer.config',
      data: Buffer.alloc(0)
    }
    const sendIncoming = setPipelineReader('incoming', ildcpMiddleware, async (packet: IlpPrepare) => {
      throw new Error('shouldn\'t call next')
    })

    ildcpStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await sendIncoming(packet)

    assert.isTrue(ildcpStub.called)
  })

  it('uses getPeerInfo service to provide information for peer.config messages', async function () {
    const IlpFulfill = {
      fulfillment: Buffer.alloc(32),
      data: Buffer.from('test data')
    }
    const packet: IlpPrepare = {
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      destination: 'peer.config',
      data: Buffer.alloc(0)
    }
    const sendIncoming = setPipelineReader('incoming', ildcpMiddleware, async () => IlpFulfill)
    const getPeerInfoSpy = sinon.spy(ildcpServices, 'getPeerInfo')
    ildcpStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await sendIncoming(packet)

    sinon.assert.calledOnce(getPeerInfoSpy)
  })

  it('uses getPeerAddress service to provide information for peer.config messages', async function () {
    const IlpFulfill = {
      fulfillment: Buffer.alloc(32),
      data: Buffer.from('test data')
    }
    const packet: IlpPrepare = {
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      destination: 'peer.config',
      data: Buffer.alloc(0)
    }
    const sendIncoming = setPipelineReader('incoming', ildcpMiddleware, async () => IlpFulfill)
    const getPeerAddressSpy = sinon.spy(ildcpServices, 'getPeerAddress')
    ildcpStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await sendIncoming(packet)

    sinon.assert.calledOnce(getPeerAddressSpy)
  })

  it('uses getOwnAddress service to provide information for peer.config messages', async function () {
    const IlpFulfill = {
      fulfillment: Buffer.alloc(32),
      data: Buffer.from('test data')
    }
    const packet: IlpPrepare = {
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      destination: 'peer.config',
      data: Buffer.alloc(0)
    }
    const sendIncoming = setPipelineReader('incoming', ildcpMiddleware, async () => IlpFulfill)
    const getOwnAddressSpy = sinon.spy(ildcpServices, 'getOwnAddress')
    ildcpStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await sendIncoming(packet)

    sinon.assert.calledOnce(getOwnAddressSpy)
  })
})