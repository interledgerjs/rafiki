# rafiki

> A modular ILP connector with stand-alone settlement engine and router

<!-- [![NPM Package](https://img.shields.io/npm/v/ilp-routing.svg?style=flat)](https://npmjs.org/package/ilp-routing) -->
[![CircleCI](https://circleci.com/gh/interledgerjs/rafiki.svg?style=shield)](https://circleci.com/gh/interledgerjs/rafiki)
[![codecov](https://codecov.io/gh/interledgerjs/rafiki/branch/master/graph/badge.svg)](https://codecov.io/gh/interledgerjs/rafiki)

![rafiki](./media/rafiki.jpeg)

_Image Credit: [Felicia Ray](https://www.redbubble.com/people/feliciaray/works/29271134-rafiki?p=poster)_

**This is a BETA. There are still TODO's:**

*Dev* :
 - [ ] Check how connector reacts if child and gets own address.
 - [ ] Config for rafiki-connector
 - [ ] Exchange rate middleware
 - [ ] Synchronous/atomic settlement model (alternative balance rule and settlement engine)
 - [ ] Pluggable settlement and/or alternative settlement engines
 - [ ] Support unsolicited peer connections
 - [ ] Add TESTS
 - [ ] Admin API cleanup and being semantically correct 
 - [ ] Fix path matching for letting connector listen on non standard ilp path
 - [ ] Change account service to use two balances
 - [ ] Move expiry logic and validate fulfillment into the outgoing client logic
 
*Cleanup*:
 - [ ] Thorough code review 😬
 - [ ] CI/CD: decide on publishing policy. e.g. Publish only if branch is master and there are tags? Run pipelines for every commit?
 - [ ] Setup code coverage
 - [ ] Move jest config out of package.json for packages
 
*Documentation*:
 - [ ] Update README files to include more detailed descriptions and usage examples
 - [ ] Update architecture diagram
 
## About

> More details coming soon, some major differences from `ilp-connector` below:

 - Stand-alone routing table and route manager
 - Stand-alone settlement engine
 - ~~Rules and protocols replace middleware and controllers and are instantiated per peer~~
 - Middleware and controllers now replace rules and protocols (Humble 🥧 🤣)
 

## Project

We designed Rafiki to be modular and therefore easy for work to be done on individual components in isolation. We encourage contributions especially in the form of new middleware or settlement engines.

If you are keen to contribute please look at the issues, especially those labelled 'Good First Issue'.

### Folders

All source code is expected to be TypeScript and is placed in the `src` folder. Tests are put in the `test` folder.

The NPM package will not contain any TypeScript files (`*.ts`) but will have typings and source maps.
