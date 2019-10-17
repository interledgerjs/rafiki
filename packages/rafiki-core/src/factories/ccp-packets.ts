import { Factory } from 'rosie'
import {
  CcpRouteUpdateRequest,
  serializeCcpRouteUpdateRequest,
  CcpRouteControlRequest,
  serializeCcpRouteControlRequest
} from 'ilp-protocol-ccp'
import Faker from 'faker'
import { deserializeIlpPrepare, IlpPrepare } from 'ilp-packet'

export const RouteUpdateRequestFactory = Factory.define<CcpRouteUpdateRequest>(
  'RouteUpdateRequest'
).attrs({
  speaker: 'test.rafiki.' + Faker.name.firstName(),
  routingTableId: Faker.random.uuid,
  currentEpochIndex: Faker.random.number({ min: 0, max: 5 }),
  fromEpochIndex: Faker.random.number({ min: 0, max: 5 }),
  toEpochIndex: Faker.random.number({ min: 0, max: 10 }),
  holdDownTime: Faker.random.number({ min: 30000, max: 45000 }),
  newRoutes: [],
  withdrawnRoutes: new Array<string>()
})

export const RouteUpdatePreparePacketFactory = {
  build: (): IlpPrepare =>
    deserializeIlpPrepare(
      serializeCcpRouteUpdateRequest(RouteUpdateRequestFactory.build())
    )
}

export const RouteControlRequestFactory = Factory.define<
  CcpRouteControlRequest
>('RouteControlRequest').attrs({
  features: new Array<string>(),
  lastKnownEpoch: 0,
  lastKnownRoutingTableId: Faker.random.uuid,
  mode: Faker.random.number({ min: 0, max: 1 })
})

export const RouteControlPreparePacketFactory = {
  build: (): IlpPrepare =>
    deserializeIlpPrepare(
      serializeCcpRouteControlRequest(RouteControlRequestFactory.build())
    )
}
