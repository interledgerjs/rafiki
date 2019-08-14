import Koa from 'koa'
import createRouter from 'koa-joi-router'
import { ilpPacketMiddleware } from '../src/koa/ilp-packet-middleware'
import { AppServices } from '../src/services'
import getRawBody = require('raw-body')
import { IldcpProtocol } from '../src/protocols'
import { BalanceRule } from '../src/rules'
import { peerMiddleWare } from '../src/koa/peer-middleware'
import axios from 'axios'

// Instantiate the App
const app = new Koa()
const router = createRouter()

// Instantiate the Services Required
const services: AppServices = {
} as AppServices

// Instantiate Protocols
const ildcp = new IldcpProtocol(services, {
  getOwnAddress: () => 'test.hardcoded'
})
const balance = new BalanceRule(services)

// Note its ugly to need to require all the services for a middleware
app.use(ilpPacketMiddleware(services, { getRawBody }))
app.use(peerMiddleWare(services, {
  getIncomingPeerId: () => {
    return 'somelocalapp'
  },
  getOutgoingPeerId: () => {
    return 'upstream'
  }
}))

app.use(ildcp.incoming)
app.use(balance.incoming)

app.use(balance.outgoing)

// Send to Upstream
router.post('/', async (ctx) => {
  ctx.res = await axios.post('www.upstream.com/ilp', ctx.state.data).then(resp => resp.data)
})

app.use(router.middleware())

app.listen(3000, () => {
  console.log('Listening on port 3000')
})
