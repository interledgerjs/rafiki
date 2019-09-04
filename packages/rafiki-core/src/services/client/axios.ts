import { Client } from '.'
import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import Agent from 'agentkeepalive'

export class AxiosClient implements Client {
  readonly axiosInstance: AxiosInstance
  readonly keepAliveAgent: Agent

  constructor (private _url: string, private _config: AxiosRequestConfig) {
    this.keepAliveAgent = new Agent({ keepAlive: true })
    const url = new URL(_url)
    this.axiosInstance = url.protocol === 'https:' ? Axios.create({
      baseURL: _url,
      timeout: 30000,
      httpsAgent: this.keepAliveAgent
    }) : Axios.create({
      baseURL: _url,
      timeout: 30000,
      httpAgent: this.keepAliveAgent
    })
  }

  public async send (data: Buffer): Promise<Buffer> {
    const res = await this.axiosInstance.post<Buffer>('', data, this._config)
    if (res.headers['callback-url']) {
      // TODO - Update config if new value provided in callback-url and callback-auth headers
    }
    return res.data
  }
}
