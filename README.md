# rafiki

> A modular ILP connector with stand-alone settlement engine and router

<!-- [![NPM Package](https://img.shields.io/npm/v/ilp-routing.svg?style=flat)](https://npmjs.org/package/ilp-routing) -->
[![CircleCI](https://circleci.com/gh/interledgerjs/rafiki.svg?style=shield)](https://circleci.com/gh/interledgerjs/rafiki)
[![codecov](https://codecov.io/gh/interledgerjs/rafiki/branch/master/graph/badge.svg)](https://codecov.io/gh/interledgerjs/rafiki)

![rafiki](./media/rafiki.jpeg)

_Image Credit: [Felicia Ray](https://www.redbubble.com/people/feliciaray/works/29271134-rafiki?p=poster)_

**This is a BETA. There are still TODO's:**

 - [ ] Thorough code review 😬
 - [ ] Documentation
 - [ ] CI/CD and some automation around commit checks
 - [ ] Get/set own address when child
 - [ ] Update config schemas and/or support old schemas
 - [ ] HTTP/2 endpoint reconnect logic
 - [ ] Support unsolicited peer connections
 - [ ] Pluggable settlement and/or alternative settlement engines
 - [ ] Synchronous/atomic settlement model (alternative balance rule and settlement engine)
 - [ ] Exchange rate rules
 - [ ] Connector control-plane service
 - [ ] Consider creating mono-repo including endpoints and router
 
 Dependencies:
 
> Changes required in other projects that we've worked around for now.
 
 - [ ] https://github.com/winstonjs/logform/pull/84
 - [ ] https://github.com/interledgerjs/ilp-protocol-ccp/pull/3
 - [ ] https://github.com/winstonjs/winston/pull/1603

## About

> More details coming soon, some major differences from `ilp-connector` below:

![architecture](./media/architecture.png)

 - Stand-alone routing table and route manager
 - Stand-alone settlement engine
 - [Endpoints](./endpoints.md) replace plugins and are built in for major transports
 - Rules and protocols replace middleware and controllers and are instantiated per peer


## Project

We designed Rafiki to be modular and therefor easy for work to be done on individual components in isolation. We encourage contributions especially in the form of new rules, protocols or settlement engines.

If you are keen to contribute please look at the issues, especially those labelled 'Good First Issue'.

### Folders

All source code is expected to be TypeScript and is placed in the `src` folder. Tests are put in the `test` folder.

The NPM package will not contain any TypeScript files (`*.ts`) but will have typings and source maps.

### Scripts

  - `clean` : Cleans the build folder and test output
  - `build` : Build the project
  - `lint`  : Run the linter over the project
  - `test`  : Run the unit tests and produce a code coverage report
  - `doc`   : Build the docs
