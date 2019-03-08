import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { PluginEndpoint } from '../../src/legacy/plugin-endpoint'
import { PluginInstance } from '../../src/legacy/plugin';
import { Endpoint } from '../../src/types/endpoint';
import { IlpPrepare, IlpReply, serializeIlpReply, deserializeIlpPrepare, IlpFulfill } from 'ilp-packet';
import { MockPlugin } from '../mocks/mockPlugin';

Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('PluginEndpoint', function () {

  let plugin: PluginInstance
  let endpoint: Endpoint<IlpPrepare, IlpReply>

  beforeEach(function () {
    plugin = new MockPlugin()
    endpoint = new PluginEndpoint(plugin)
  })

  afterEach(function () {
  })

  it('should sendData on plugin when sending outgoing', async function (){

    const prepare = {
      destination: 'test.alice',
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      data: Buffer.from('PREPARE')
    } as IlpPrepare

    const fulfill = {
      fulfillment: Buffer.alloc(32),
      data: Buffer.from('FULFILL')
    } as IlpFulfill

    plugin.sendData = async (data: Buffer) => {
      const request = deserializeIlpPrepare(data)
      assert.deepEqual(prepare, request)
      return serializeIlpReply(fulfill)
    }

    const reply = await endpoint.sendOutgoingRequest(prepare)

    assert.deepEqual(fulfill, reply)
  
  })

  it('should sendMoney on plugin when sending outgoing peer.settle', async function (){

    const prepare = {
      destination: 'peer.settle',
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      data: Buffer.from('PREPARE')
    } as IlpPrepare

    const fulfill = {
      fulfillment: Buffer.alloc(32),
      data: Buffer.alloc(0)
    } as IlpFulfill

    plugin.sendMoney = async (amount: string) => {
      assert.deepEqual(amount, prepare.amount)
      return
    }

    const reply = await endpoint.sendOutgoingRequest(prepare)

    assert.deepEqual(fulfill, reply)
  
  })

  it('should throw if the plugin throws when calling sendMoney', async function (){

    const prepare = {
      destination: 'peer.settle',
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      data: Buffer.from('PREPARE')
    } as IlpPrepare

    plugin.sendMoney = async (amount: string) => {
      throw new Error()
    }
    try {
      const reply = await endpoint.sendOutgoingRequest(prepare)
      assert.fail('Should have thrown')
    } catch (e) {

    }
  
  })

  it('should throw if the plugin throws when calling sendData', async function (){

    const prepare = {
      destination: 'test.alice',
      amount: '100',
      executionCondition: Buffer.alloc(32),
      expiresAt: new Date(),
      data: Buffer.from('PREPARE')
    } as IlpPrepare

    plugin.sendData = async (data: Buffer) => {
      throw new Error()
    }
    
    try {
      const reply = await endpoint.sendOutgoingRequest(prepare)
      assert.fail('Should have thrown')
    } catch (e) {

    }
  
  })

})
