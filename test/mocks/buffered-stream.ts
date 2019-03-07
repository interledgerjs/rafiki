import { Duplex, DuplexOptions } from "stream";


export class BufferedStream extends Duplex {

  constructor(options?: DuplexOptions) {
    super(options)
    this.chunks = new Array()
  }

  public chunks: Array<any>

  public flush(): void {
    while(this.chunks.length > 0) {
      this.push(this.chunks.shift())
    }
  }

  public error(e: Error) {
    this.emit('error', e)
  }

  _write(chunk: any, encoding: string, callback: (error?: Error) => void): void {
    this.chunks.push(chunk)
    callback()
  }

  _read() {
    
    // NO OP
  }
}