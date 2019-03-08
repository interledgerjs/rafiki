/**
 * Polyfill until https://github.com/winstonjs/winston/pull/1603 is released
 *
 * For now use `import { log } from './winston'`
 * In future we'll use `import * as log from 'winston'`
 *
 * component.ts - `const logger = log.child({component: 'component-name'})`
 */

import * as winston from 'winston'

const log = {
  child: (options: Object): winston.Logger => {
    const logger = winston['default'].exceptions.logger
    const child = logger.child(options)
    // TODO: Consider adding a transport that writes to debug if this is enabled for the component
    // if (options['component'] && debug.enabled(options['component'])) {
    //   debug(options['component']).log = child.debug
    // }
    return child
  }
}
export { log }
