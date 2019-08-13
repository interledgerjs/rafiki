import { Factory } from 'rosie'
import Knex from 'knex'
import { AppServices, Stats, Alerts } from '../../src/services'
import { KnexPeerInfoService } from '../../src/services/peer-info/knex'
import { InMemoryBalanceService } from '../../src/services/balance/in-memory'
import { AxiosHttpClientService } from '../../src/services/client/axios'

export const AppServicesFactory = Factory.define<AppServices>('AppServices')
  .option('knex', Knex(':memory:'))
  //@ts-ignore
  .attr('peers', ['knex'], (knex: Knex) => {
    return new KnexPeerInfoService(knex)
  })
  .attrs({
    stats: new Stats(),
    alerts: new Alerts(),
    balances: new InMemoryBalanceService(),
    clients: new AxiosHttpClientService()
  })