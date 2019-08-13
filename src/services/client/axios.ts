import { ClientService, Client } from '.'
import { PeerServiceBase } from '..'
import { HttpClientConfig } from '../../koa/ilp-client-middleware'
import Axios, { AxiosRequestConfig } from 'axios'

export class AxiosHttpClientService extends PeerServiceBase<Client> implements ClientService {
  public create (peerId: string, config: HttpClientConfig) {
    const axiosConfig = { responseType: 'arraybuffer', headers: {} }
    if (config.peerAuthToken) axiosConfig.headers = { 'Authorization': `Bearer ${config.peerAuthToken}` }
    const client = new AxiosClient(config.peerUrl, axiosConfig)
    this.set(peerId, client)
    return client
  }
}

class AxiosClient implements Client {
  constructor (private _url: string, private _config: AxiosRequestConfig) {
  }
  public async send (data: Buffer) {
    // TODO: Connection pooling
    const res = await Axios.post<Buffer>(this._url, data, this._config)
    if (res.headers['callback-url']) {
      // TODO - Update config if new value provided in callback-url and callback-auth headers
    }
    return res.data
  }
}
