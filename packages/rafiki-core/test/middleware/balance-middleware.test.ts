import { createIncomingBalanceMiddleware, createOutgoingBalanceMiddleware } from '../../src/middleware/balance'

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT


// TODO: waiting for peers and accounts interface to be finalised
describe.skip('Incoming Balance Middleware', function () {
  it('successful packet increments the balance')

  it('failed packet does not increment balance')

})

describe.skip('Outgoing Balance Middleware', function () {
  it('successful outgoing decrements the balance')

  it('failed packet does not increment balance')
})
