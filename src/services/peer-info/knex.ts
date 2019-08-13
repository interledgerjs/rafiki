import { Peer } from '../../models/Peer'
import { PeerInfo, PeerRelation } from '../../types'
import { Rule } from '../../models/Rule'
import { Protocol } from '../../models/Protocol'
import Knex from 'knex'
import { log } from '../../winston'
import { PeerServiceBase } from '..'
import { PeerInfoService } from '.'
const logger = log.child({ component: 'knex-peer-info-service' })

export class KnexPeerInfoService extends PeerServiceBase<PeerInfo> implements PeerInfoService {

  constructor (private _knex: Knex) {
    super()
  }

  public async load () {
    logger.info('loading peer info from DB...')
    const result = await Peer.query(this._knex).eager('[rules,protocols,endpoint]')
    logger.info(`loaded ${result.length} records`)
    result.forEach(peer => {
      const rules = {}
      peer['rules'].map((rule: Rule) => {
        rules[rule.name] = rule.config || {}
      })
      const protocols = {}
      peer['protocols'].map((protocol: Protocol) => {
        protocols[protocol.name] = protocol.config || {}
      })
      this.set(peer.id, {
        id: peer.id,
        assetCode: peer.assetCode,
        assetScale: peer.assetScale,
        relation: peer.relation as PeerRelation,
        rules,
        protocols
      })
    })
  }

  public async create (peer: PeerInfo): Promise<PeerInfo> {
    // TODO - Store in DB
    throw new Error('not implemented')
  }

}
