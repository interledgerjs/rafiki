import { Service } from '..'
import { HttpClientConfig } from '../../koa/ilp-client-middleware'

export interface Client {
  send: (data: Buffer) => Promise<Buffer>
}
