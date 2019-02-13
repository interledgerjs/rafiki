import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import {Pipelines} from '../../../src/types/middleware'
import MiddlewarePipeline from '../../../src/middleware/pipeline'
import { IlpPrepare, IlpReply } from 'ilp-packet';

describe('CCP Middleware', function () {
    let pipeline: Pipelines

    beforeEach( function () {
      pipeline = {
        startup: new MiddlewarePipeline<void, void>(),
        incomingData: new MiddlewarePipeline<IlpPrepare, IlpReply>(),
        incomingMoney: new MiddlewarePipeline<string, void>(),
        outgoingData: new MiddlewarePipeline<IlpPrepare, IlpReply>(),
        outgoingMoney: new MiddlewarePipeline<string, void>(),
        shutdown: new MiddlewarePipeline<void, void>()
      }
      const startupPipeline = constructMiddlewarePipeline(pipelines.startup, async () => { return account.startup() })
      const shutdownPipeline = constructMiddlewarePipeline(pipelines.shutdown, async () => { return account.shutdown() })
      const outgoingIlpPacketPipeline = constructMiddlewarePipeline(pipelines.outgoingData, account.endpoint!.request.bind(account.endpoint))
      const incomingIlpPacketPipeline = constructMiddlewarePipeline(pipelines.incomingData, (packet: IlpPrepare) => this._coreIlpPacketHander(packet, account.id,  this.sendIlpPacket.bind(this)))
    })

    it('can instantiate the middleware ', function() {
        console.log(pipeline)
    })

})