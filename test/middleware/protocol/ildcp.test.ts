import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { constructPipelines, constructMiddlewarePipeline } from '../../../src/lib/middleware'
import { Ildcp as IldcpMiddleware } from '../../../src/middleware/protocol/ildcp'
import { IlpPrepare, IlpFulfill, serializeIlpFulfill } from 'ilp-packet';
import { Pipelines } from '../../../src/types/middleware';
import * as ILDCP from 'ilp-protocol-ildcp'
import { PeerInfo } from '../../../src/types/peer';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Ildcp Middlware', function () {

  let pipelines: Pipelines
  let ildcpMiddleware: IldcpMiddleware
  let ILDCPStub: sinon.SinonStub

  beforeEach(async function () {
    ildcpMiddleware = new IldcpMiddleware({
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
    })
    const middleware = {
      'ildcp': ildcpMiddleware
    }
    pipelines = await constructPipelines(middleware)
  })

  afterEach(function () {
    ILDCPStub.restore()
  })

  it('inserts itself into the incoming data pipeline', async function () {
    assert.equal(pipelines.incomingData.getMethods().length, 1)
    assert.isEmpty(pipelines.outgoingData.getMethods())
    assert.isEmpty(pipelines.incomingMoney.getMethods())
    assert.isEmpty(pipelines.outgoingMoney.getMethods())
    assert.isEmpty(pipelines.startup.getMethods())
    assert.isEmpty(pipelines.shutdown.getMethods())
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
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, async (packet: IlpPrepare) => {
      didNextGetCalled = true
      return IlpFulfill
    })
    ILDCPStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await incomingIlpPacketHandler(packet)

    assert.isOk(didNextGetCalled)
    assert.isNotOk(ILDCPStub.called)
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
    let didNextGetCalled: boolean = false
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, async (packet: IlpPrepare) => {
      didNextGetCalled = true
      return IlpFulfill
    })
    ILDCPStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await incomingIlpPacketHandler(packet)

    assert.isNotOk(didNextGetCalled)
    assert.isOk(ILDCPStub.called)
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
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, async (packet: IlpPrepare) => IlpFulfill)
    const getPeerInfoSpy = sinon.spy(ildcpMiddleware, 'getPeerInfo')
    ILDCPStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await incomingIlpPacketHandler(packet)

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
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, async (packet: IlpPrepare) => IlpFulfill)
    const getPeerAddressSpy = sinon.spy(ildcpMiddleware, 'getPeerAddress')
    ILDCPStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await incomingIlpPacketHandler(packet)

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
    const incomingIlpPacketHandler = constructMiddlewarePipeline(pipelines.incomingData, async (packet: IlpPrepare) => IlpFulfill)
    const getOwnAddressSpy = sinon.spy(ildcpMiddleware, 'getOwnAddress')
    ILDCPStub = sinon.stub(ILDCP, 'serve').resolves(serializeIlpFulfill(IlpFulfill))

    await incomingIlpPacketHandler(packet)

    sinon.assert.calledOnce(getOwnAddressSpy)
  })
})