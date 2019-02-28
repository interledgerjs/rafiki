# ilp-routing
> (BETA Stage) Router and Route Manager for Interledger-style addressing

[![NPM Package](https://img.shields.io/npm/v/ilp-routing.svg?style=flat)](https://npmjs.org/package/ilp-routing)
[![CircleCI](https://circleci.com/gh/interledgerjs/ilp-routing.svg?style=shield)](https://circleci.com/gh/interledgerjs/ilp-routing)

<!-- ## Usage

```js
// TypeScript
import Router from 'ilp-router'

``` -->

## Project


## Members

### ilp-router
Stand alone router for ilp address space. Contains a routing table and a forwarding routing table. Routing table is used to determine where the nextHop is based on a given address. The forwarding routing table is used to broadcasting routes to peers.

### ilp-route-manager
A route manager that deals with adding/removing peers and adding/removing routes for given peers. Based on these it will update the routing table accordingly.

#### Note CCP is outside the scope of the functionalities of this library.

### Folders

All source code is expected to be TypeScript and is placed in the `src` folder. Tests are put in the `test` folder.

The NPM package will not contain any TypeScript files (`*.ts`) but will have typings and source maps.

### Scripts

  - `clean` : Cleans the build folder and test output
  - `build` : Build the project
  - `lint`  : Run the linter over the project
  - `test`  : Run the unit tests and produce a code coverage report
  - `doc`   : Build the docs

### TODO
- [ ] Add Logging
- [ ] Add Auth
- [ x ] Add weight to lessen the need for relations to be used
- [ ] Add Performance Regression
- [ ] Increase test coverage
- [ ] Ensure adding and removing routes are deterministic and no race conditions exist
- [ ] Add dragon filtering back to the layer between the routing and forwarding routing table
- [ ] Create a more favorable data structure for Peers incoming routes table. One way this can be achieved is having a write heavy data structure that is read fast. (This is probably preferable.)

### Future notes/reading
Implement BGP type path based filtering
https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/13753-25.html#bestpath
Multipath could also be an interesting area to pursue.