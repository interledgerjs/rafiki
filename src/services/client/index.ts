export interface Client {
  send: (data: Buffer) => Promise<Buffer>
}
