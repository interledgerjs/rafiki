import { Endpoint } from '../types/endpoint'
import { PluginInstance } from './plugin'
import { RequestHandler } from '../types/channel'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply, isFulfill } from 'ilp-packet'

/**
 * Create an endpoint that wraps a legacy plugin.
 *
 * The plugin is expected to already be connected.
 *
 * Converts sendMoney on the plugin to ILP packets addressed to `peer.config`
 */
export class PluginEndpoint implements Endpoint<IlpPrepare, IlpReply> {

  private _plugin: PluginInstance

  constructor (plugin: PluginInstance) {
    this._plugin = plugin
  }

  public async sendOutgoingRequest (request: IlpPrepare, sentCallback?: (() => void) | undefined): Promise<IlpReply> {

    if (request.destination === 'peer.settle') {
      const replyPromise = this._plugin.sendMoney(request.amount)
      if (sentCallback) sentCallback()
      try {
        await replyPromise
        return {
          fulfillment: Buffer.alloc(32), // TODO - Use hardcoded fulfillment
          data: Buffer.alloc(0)
        }
      } catch (e) {
        // TODO - What to do if the plugin threw when sending money?
        return {
          code: '',
          message: '',
          triggeredBy: 'self',
          data: Buffer.alloc(0)
        }
      }
    }

    const replyPromise = this._plugin.sendData(serializeIlpPrepare(request))
    if (sentCallback) sentCallback()
    return deserializeIlpReply(await replyPromise)
  }

  public setIncomingRequestHandler (handler: RequestHandler<IlpPrepare, IlpReply>): this {
    this._plugin.registerMoneyHandler(async (amount: string) => {

      // TODO: Check logic for converting to sendMoney response from a peer.settle response
      const reply = await handler({
        amount,
        destination: 'peer.settle',
        executionCondition: Buffer.alloc(32),
        expiresAt: new Date(Date.now() + 30000),
        data: Buffer.alloc(0)
      })
      if (isFulfill(reply)) {
        return
      } else {
        throw new Error('settlement error')
      }
    })

    this._plugin.registerDataHandler(async (data: Buffer) => {
      return serializeIlpReply(await handler(deserializeIlpPrepare(data)))
    })

    return this
  }

}
