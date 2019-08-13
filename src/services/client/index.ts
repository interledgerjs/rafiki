import { PeerService } from '..'
import { HttpClientConfig } from '../../koa/ilp-client-middleware'

export interface Client {
  send: (data: Buffer) => Promise<Buffer>
}

export interface ClientService extends PeerService<Client> {
  create: (peerId: string, config: HttpClientConfig) => Client
}
