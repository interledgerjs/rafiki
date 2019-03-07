/**
 * Module "required" by Mocha which sets global hooks to override logging output
 */

import * as winston from 'winston'
import { PassThrough, Transform } from 'stream';

const format = winston.format.json({
  replacer: (key: string, value: any) => {
    return typeof value === 'bigint'
      ? value.toString()
      : value
  }
})

// Async so that we let Mocha load before these are executed
setTimeout(() => {
  let stream: Transform

  beforeEach(function () {
    stream = new PassThrough()
    stream.pause()

    // TODO: Clears all transports - we should try to do this in a reversible way
    winston.configure({
      format,
      transports: new winston.transports.Stream({ stream, format })
    })
  })
  
  afterEach(function () {
    if(this && this.currentTest 
        && this.currentTest.state !== 'passed'
        && stream.readableLength > 0) {
      
        process.stderr.write("==== LOGS: start ====\r\n")
        stream.pipe(process.stderr, { end: false })
        stream.write("<==== LOGS: end ====\r\n")
        stream.end()
    }
  })
})
