import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { CcpReceiver } from '../../../../src/middleware/protocol/ccp/ccp-receiver';
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)


describe('ccp-receiver', function () {
    let CcpReceiver: CcpReceiver    
})