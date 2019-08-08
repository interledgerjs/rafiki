import * as Koa from 'koa'
import { IlpPrepare, IlpReply } from 'ilp-packet'

export interface RafikiContext extends Koa.Context {
  ilpRequest?: IlpPrepare
  ilpResponse?: IlpReply
}
