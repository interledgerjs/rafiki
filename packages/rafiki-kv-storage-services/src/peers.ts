import { Database, StorageArea } from '@kv-storage/core'
import {Peer, PeerInfo, PeerRelation, PeersService} from '@interledger/rafiki-core'
import { Observable } from 'rxjs'
import {AxiosClient} from '@interledger/rafiki-core/build/services/client/axios'
import {AxiosRequestConfig} from 'axios'

class KvPeer implements Peer {
  id: string
  url?: string
  relation: PeerRelation
  relationWeight?: number
  authToken?: string
  isCcpSender: boolean
  isCcpReceiver: boolean
  defaultAccountId: string

  readonly axiosClient: AxiosClient

  constructor (info: PeerInfo) {
    Object.assign(this, info)

    if (this.url) {
      const axiosConfig: AxiosRequestConfig = { responseType: 'arraybuffer', headers: {} }
      if (this.authToken) axiosConfig.headers = { Authorization: `Bearer ${this.authToken}` }
      this.axiosClient = new AxiosClient(this.url, axiosConfig)
    }
  }

  public send (data: Buffer): Promise<Buffer> {
    if (!this.axiosClient) throw new Error('No send client configured for peer')
    return this.axiosClient.send(data)
  }
}

export class KvPeersService implements PeersService {
  private _storageArea: StorageArea<Peer>

  constructor (database?: Database) {
    this._storageArea = new StorageArea<Peer>({
      namespace: 'peers'
    })
  }

  async add (peerInfo: Readonly<PeerInfo>): Promise<KvPeer> {
    const kvPeer = new KvPeer(peerInfo)
    await this._storageArea.set(kvPeer.id, kvPeer)
    return kvPeer
  }

  async get (id: string): Promise<Peer> {
    const peer = await this._storageArea.get(id)
    if (peer) {
      const kvPeer = new KvPeer(peer)
      return kvPeer
    } else {
      throw new Error('Peer not found')
    }
  }

  readonly added: Observable<Peer>
  readonly deleted: Observable<string>
  list: () => Promise<Peer[]>
  remove: (peerId: string) => Promise<void>
  update: (peer: Readonly<PeerInfo>) => Promise<Peer>
  readonly updated: Observable<Peer>

}
