
export interface AccountInfo {
  id: string,
  peerId: string
  assetCode: string,
  assetScale: number,
  maximumBalance: bigint
  minimumBalance: bigint
}
