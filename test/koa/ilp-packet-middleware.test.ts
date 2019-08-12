import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {IlpFulfill, IlpPrepare, IlpReject} from 'ilp-packet'
import {AlertRule, Alerts} from '../../src/rules/alert'
import {PeerInfo} from '../../src/types/peer'
import {setPipelineReader} from '../../src/types/rule'

test('Koa: ILP Packet Middleware', async () => {
  const ctx = {
    response: { 
      set: sinon.mock()
    }
    /* ADD OTHER MOCKS */
  }
  const next = sinon.mock(() => {
    expect(ctx).toMatchSnapshot()
  })
  
  await expect(greetings(ctx, next)).resolves.toBeUndefined()

  expect(next).toHaveBeenCalledTimes(1)  
  expect(ctx).toMatchSnapshot()
  expect(ctx.response.set.mock.calls).toMatchSnapshot()

})
