
export interface AccountInfo {
  [key: string]: any
  id: string,
  peerId: string
  assetCode: string,
  assetScale: number,
  maximumBalance: bigint
  minimumBalance: bigint
}
