/**
 * Module "required" by Mocha which sets global hooks to override logging output
 */

import * as winston from 'winston'
import { PassThrough, Writable, Transform } from 'stream';

// Async so that we let Mocha load before these are executed
setTimeout(() => {
  let buffer: Transform

  beforeEach(function () {
    buffer = new PassThrough()
    buffer.pause()

    // TODO: Clears all transports - we should try to do this in a reversible way
    winston.clear()
    winston.add( new winston.transports.Stream({ 
      stream: buffer,
      format: winston.format.combine(
        winston.format.prettyPrint()
        // winston.format.simple()
      )
    }))  
  })
  
  afterEach(function () {
    if(this && this.currentTest 
        && this.currentTest.state !== 'passed'
        && buffer.readableLength > 0) {
      
        process.stderr.write("==== LOGS: start ====\r\n")
        buffer.pipe(process.stderr, { end: false })
        buffer.write("<==== LOGS: end ====\r\n")
        buffer.end()
    }
  })
})
