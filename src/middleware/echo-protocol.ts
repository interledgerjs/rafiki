import { serializeIlpPrepare } from 'ilp-packet'
import { Reader, Writer } from 'oer-utils'
import { InvalidPacketError } from 'ilp-packet/dist/src/errors'
import { log } from '../winston'
import { SELF_PEER_ID } from '../constants'
import { sendToPeer } from '../services'
import { RafikiContext } from '../rafiki'
const logger = log.child({ middleware: 'echo-protocol' })

const MINIMUM_ECHO_PACKET_DATA_LENGTH = 16 + 1
const ECHO_DATA_PREFIX = Buffer.from('ECHOECHOECHOECHO', 'ascii')

/**
 * Intercepts and handles messages addressed to the connector otherwise forwards it onto next.
 *
 * TODO: This should be a controller
 */
export function createOutgoingEchoProtocolMiddleware (minMessageWindow: number) {
  return async ({ state: { ilp, peers: { outgoing } } }: RafikiContext, next: () => Promise<any>) => {

    const { info } = await outgoing
    const { req: { data, amount, expiresAt, executionCondition } } = ilp

    // TODO : Will this work? Is the self peer in the peers service or just the connector
    if (info.id === SELF_PEER_ID) {

      if (data.length < MINIMUM_ECHO_PACKET_DATA_LENGTH) throw new InvalidPacketError('packet data too short for echo request. length=' + data.length)
      if (!data.slice(0, 16).equals(ECHO_DATA_PREFIX)) throw new InvalidPacketError('packet data does not start with ECHO prefix.')

      const reader = new Reader(data)
      reader.skip(ECHO_DATA_PREFIX.length)
      const type = reader.readUInt8Number()

      if (0 === type) {
        const sourceAddress = reader.readVarOctetString().toString('ascii')
        const writer = new Writer()
        writer.write(ECHO_DATA_PREFIX)
        writer.writeUInt8(0x01)

        logger.verbose('responding to echo packet', { sourceAddress })

        ilp.rawRes = await sendToPeer(await outgoing, serializeIlpPrepare({
          amount: amount,
          destination: sourceAddress,
          executionCondition: executionCondition,
          expiresAt: new Date(Number(expiresAt) - minMessageWindow),
          data: writer.getBuffer()
        }))
      } else {
        logger.error('received unexpected echo response.')
        throw new Error('received unexpected echo response.')
      }
    } else {
      await next()
    }
  }
}
