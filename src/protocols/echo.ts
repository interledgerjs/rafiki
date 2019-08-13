import { IlpPrepare, IlpReply } from 'ilp-packet'
import { Rule } from '../types/rule'
import { Reader, Writer } from 'oer-utils'
import { InvalidPacketError } from 'ilp-packet/dist/src/errors'
import { log } from '../winston'
import { AppServices } from '../services'
import { SELF_PEER_ID } from '../connector';
const logger = log.child({ component: 'echo-protocol' })

const MINIMUM_ECHO_PACKET_DATA_LENGTH = 16 + 1
const ECHO_DATA_PREFIX = Buffer.from('ECHOECHOECHOECHO', 'ascii')

export interface EchoProtocolServices {
  minMessageWindow: number
}

/**
 * Intercepts and handles messages addressed to the connector otherwise forwards it onto next.
 */
export class EchoProtocol extends Rule {
  constructor (services: AppServices, { minMessageWindow }: EchoProtocolServices) {
    super(services, {
      outgoing: async ({ state: { ilp, peers } }) => {

        const { req: { data, amount, expiresAt, executionCondition } } = ilp

        if (peers.outgoing.id === SELF_PEER_ID) {

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

            // TODO - Get handle on outgoing pipeline for this peer
            const outgoing: IlpPrepare = {
              amount: amount,
              destination: sourceAddress,
              executionCondition: executionCondition,
              expiresAt: new Date(Number(expiresAt) - minMessageWindow),
              data: writer.getBuffer()
            }
            ilp.res = {} as IlpReply

          } else {
            logger.error('received unexpected echo response.')
            throw new Error('received unexpected echo response.')
          }
        }
      }
    })
  }
}
