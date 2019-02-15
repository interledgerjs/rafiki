import { Endpoint } from '../../src/types/endpoint'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import { EventEmitter } from 'events';

export default class MockIlpEndpoint extends EventEmitter implements Endpoint<IlpPrepare, IlpReply> {

  /**
   * A handler for incoming requests.
   */
  handler: (packet: IlpPrepare) => Promise<IlpReply>

  /**
   * A handler for outgoing requests.
   */
  outgoingHandler: (packet: IlpPrepare) => Promise<IlpReply>

  constructor(outgoingHandler: (packet: IlpPrepare) => Promise<IlpReply>) {
    super()
    this.outgoingHandler = outgoingHandler
  }

  async request (packet: IlpPrepare): Promise<IlpReply> {
    if(!this.outgoingHandler) throw new Error('A packet handler needs to be set.')

    return this.outgoingHandler(packet)
  }
}