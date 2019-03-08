import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
import { CcpSender } from '../../../src/protocols/ccp/ccp-sender';


describe('ccp-sender', function () {
    let ccpSender: CcpSender



})