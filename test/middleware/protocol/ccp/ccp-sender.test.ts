import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { CcpSender } from '../../../../src/middleware/protocol/ccp/ccp-sender';


describe('ccp-sender', function () {
    let ccpSender: CcpSender



})