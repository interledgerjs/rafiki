# rafiki

> A modular ILP connector with stand-alone settlement engine and router

![](./images/rafiki.jpeg)

_Image Credit: [Felicia Ray](https://www.redbubble.com/people/feliciaray/works/29271134-rafiki?p=poster)_

**This is a BETA. There are still TODO's:**

 - [ ] Thorough code review 😬
 - [ ] Documentation
 - [ ] CI/CD and some automation around commit checks
 - [ ] Get/set own address when child
 - [ ] Make own address configurable
 - [ ] Update config schemas and/or support old schemas
 - [ ] HTTP/2 endpoint reconnect logic
 - [ ] Fix/review logging
 - [ ] Support unsolicited peer connections
 - [ ] Pluggable settlement and/or alternative settlement engines
 - [ ] Synchronous/atomic settlement model (alternative balance rule and settlement engine)
 - [ ] Exchange rate rules
 - [ ] Connector control-plane service
 - [ ] Consider creating mono-repo including endpoints and router

## About

> More details coming soon, some major differences from `ilp-connector` below:

<img style="float: center;" src="./images/architecture.png">

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
