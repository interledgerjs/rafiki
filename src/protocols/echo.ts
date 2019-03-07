import { IlpPrepare, IlpReply, IlpFulfill } from 'ilp-packet'
import { Rule, IlpRequestHandler } from '../types/rule'
import { Reader, Writer } from 'oer-utils'
import { InvalidPacketError } from 'ilp-packet/dist/src/errors'

const MINIMUM_ECHO_PACKET_DATA_LENGTH = 16 + 1
const ECHO_DATA_PREFIX = Buffer.from('ECHOECHOECHOECHO', 'ascii')

export interface EchoProtocolServices {
  getOwnAddress: () => string,
  minMessageWindow: number
}

export class EchoProtocol extends Rule {
  constructor ({ getOwnAddress, minMessageWindow }: EchoProtocolServices) {
    super({
      processIncoming: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {
        return next(request)
      },
      processOutgoing: async (request: IlpPrepare, next: IlpRequestHandler): Promise<IlpReply> => {

        const { destination, data, amount, expiresAt, executionCondition } = request

        if (destination === getOwnAddress()) {

          if (data.length < MINIMUM_ECHO_PACKET_DATA_LENGTH) throw new InvalidPacketError('packet data too short for echo request. length=' + data.length)
          if (!data.slice(0, 16).equals(ECHO_DATA_PREFIX)) throw new InvalidPacketError('packet data does not start with ECHO prefix.')

          const reader = new Reader(data)
          reader.skip(ECHO_DATA_PREFIX.length)
          const type = reader.readUInt8Number()

          // TODO: add logging
          // log.trace('responding to ping. sourceAccount=%s sourceAddress=%s cond=%s', sourceAccount, sourceAddress, parsedPacket.executionCondition.slice(0, 9).toString('base64'))

          if (0 === type) {
            const sourceAddress = reader.readVarOctetString().toString('ascii')
            const writer = new Writer()
            writer.write(ECHO_DATA_PREFIX)
            writer.writeUInt8(0x01)

            return this.incoming.write({
              amount: amount,
              destination: sourceAddress,
              executionCondition: executionCondition,
              expiresAt: new Date(Number(expiresAt) - minMessageWindow),
              data: writer.getBuffer()
            })
          } else {
            // TODO: add logging
            // log.error('received unexpected echo response.')
            throw new Error('received unexpected echo response.')
          }
        }

        return next(request)

      }
    })
  }
}
