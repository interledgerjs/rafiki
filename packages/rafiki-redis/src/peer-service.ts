import { PeerService, PeerInfo, Peer } from '@interledger/rafiki-core'
import { Observable, Subject } from 'rxjs'
import Redis from 'ioredis'

// TODO create a pool of outgoing http clients based on URL. Pass auth token into send function?

export type RedisPeerServiceConfig = {
  URI?: string,
  prefix: string,
}

export class RedisPeerService implements PeerService {

  private _redis: Redis.Redis
  readonly _prefix: string

  private _addedPeers: Subject<Peer>
  private _updatedPeers: Subject<Peer>
  private _removedPeers: Subject<string>

  readonly added: Observable<Peer>
  readonly deleted: Observable<string>
  readonly updated: Observable<Peer>

  constructor (config: RedisPeerServiceConfig) {
    this._redis = new Redis(config.URI)
    this._prefix = config.prefix || ''

    this._addedPeers = new Subject<Peer>()
    this._updatedPeers = new Subject<Peer>()
    this._removedPeers = new Subject<string>()
  }

  async add (peerInfo: Readonly<PeerInfo>): Promise<Peer> {
    const key = this.key(peerInfo.id)

    const peerExists = await this._redis.get(key)
    if (peerExists) {
      throw new Error('Peer already exists')
    }

    await this._redis.set(key, JSON.stringify(peerInfo))
    const peer = peerInfo as Peer

    this._addedPeers.next(peer)

    return peer
  }

  async get (id: string): Promise<Peer> {
    const key = this.key(id)
    const peerJson = await this._redis.get(key)
    if (!peerJson) {
      throw new Error('Peer does not exist')
    }
    const peer: PeerInfo = JSON.parse(peerJson)
    return peer as Peer
  }

  // TODO implement
  async list (): Promise<Peer[]> {
    const peerKeys = await this._redis.keys(this.key('peers:'))

    return [] as Peer[]
  }

  async remove(id: string): Promise<void> {
    const key = this.key(id)

    const peerJson = await this._redis.get(key)
    if (!peerJson) {
      throw new Error('Peer does not exist')
    }

    await this._redis.del(key)
    this._removedPeers.next(key)

    return
  }

  async update(peerInfo: Readonly<PeerInfo>): Promise<Peer> {
    const key = this.key(peerInfo.id)

    const peerJson = await this._redis.get(key)
    if (!peerJson) {
      throw new Error('Peer does not exist')
    }

    await this._redis.set(key, JSON.stringify(peerInfo))
    const peer = peerInfo as Peer
    this._updatedPeers.next(peer)

    return peer
  }

  private key = (key: string) => {
    return this._prefix + ':peers:' + key
  }
}
