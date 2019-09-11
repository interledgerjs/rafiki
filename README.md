# rafiki

> A modular ILP connector with stand-alone settlement engine and router

<!-- [![NPM Package](https://img.shields.io/npm/v/ilp-routing.svg?style=flat)](https://npmjs.org/package/ilp-routing) -->
[![Build Status](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Finterledgerjs%2Frafiki%2Fbadge&style=flat)](https://actions-badge.atrox.dev/interledgerjs/rafiki/goto)
[![codecov](https://codecov.io/gh/interledgerjs/rafiki/branch/master/graph/badge.svg)](https://codecov.io/gh/interledgerjs/rafiki)

![rafiki](./media/rafiki.jpeg)

_Image Credit: [Felicia Ray](https://www.redbubble.com/people/feliciaray/works/29271134-rafiki?p=poster)_

**This is a BETA**

## About

> More details coming soon, some major differences from `ilp-connector` below:

 - Stand-alone routing table and route manager
 - Stand-alone settlement engine
 - ~~Rules and protocols replace middleware and controllers and are instantiated per peer~~
 - Middleware and controllers now replace rules and protocols (Humble 🥧 🤣)

## Getting started
The monorepo is set up to use lerna and yarn workspaces. To get started run the following:
1. yarn install - Yarn will install the dependencies and do the necessary linking. So no need to run `lerna bootstrap`.
2. yarn build
3. yarn test - This will run the tests in all the packages.

If you have any questions, ask them on the `rafiki` channel on the [Interledger](https://communityinviter.com/apps/interledger/interledger-working-groups-slack) slack.

## Contributing
We designed Rafiki to be modular and therefore easy for work to be done on individual components in isolation. We encourage contributions especially in the form of new middleware.
If you are interested in contributing, please have a look at the [issues](https://github.com/interledgerjs/rafiki/issues) or [project boards](https://github.com/interledgerjs/rafiki/projects). Keep the below points in mind when contributing.

### Creating new packages
All source code is expected to be TypeScript and is placed in the `src` folder. Tests are put in the `test` folder and we use [Jest](https://jestjs.io/) as our test framework.
The NPM package will not contain any TypeScript files (`*.ts`) but will have typings and source maps. A typical project should have the following structure:
```
|-- src
|-- test
|-- package.json
|-- jest.config.json
|-- tsconfig.build.json
```
Feel free to copy the `tsconfig.build.json` and `jest.config.js` from the `rafiki-core` package. Package names should be scoped to `@interledger` and the `package.json` file should specify the following
```js
{
  "name": "@interldger/<package-name>",
  "license": "Apache-2.0",
  "publishConfig": {
    "access": "public"
  }
}
```
In the `scripts` section of the `package.json`, be sure to have `test:ci` (which runs tests with coverage) and `codecov`. These will be called from the CI pipeline. Please use the following as a guideline:
```js
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "clean": "rm -Rf .nyc_output && rm -Rf coverage && rm -Rf build ",
    "codecov": "codecov --root=../../ -f ./coverage/lcov.info -F <package name>",
    "test": "jest --bail --runInBand",
    "test:ci": "jest --bail --runInBand --coverage"
  }
```

### Dependencies
We keep devDependencies that are shared across all packaages in the root `package.json` file. Dependencies can be added to individual packages using Lerna
```sh
lerna add <package to install> --scope=<package-name>

# Add dev dependency
lerna add <package to install> --scope=<package-name> --dev
```

### Committing
Before committing, please ensure that the tests and linter have been run. This can be done at the root of the project by running 
```sh
# All tests in all packages
lerna run test

# Scoping to a package
lerna run test --scope=@interledger/<package-name>
```

or in the package directory
```sh
yarn test
```

We use [Conventional Commits](https://www.conventionalcommits.org/) for our commit messages. Please scope your commit messages to the package that it concerns e.g. `fix(rafiki-core): ...`

### Running script commands
Script commands such as `test` and `lint` can be run from the root of the project by running 
```sh
# All tests in all packages
lerna run test

#Scoping to a package
lerna run test --scope=@interledger/<package-name>
```

or in the package directory
```sh
yarn test
```

### Versioning
We use independent versioning and only maintainers can release a new version. In order to do this, be sure that you are on `master` and are up to date.
```sh
# On master
git pull
lerna version --conventional-commits
```
Follow the command prompts to pick the appropriate version numbers. Once this is done, lerna will automatically update the `package.json` file, commit the changes and add the necessary tags. Thereafter it will push the commits and tags to `Github`. This will kick off `CircleCI` where it will be published to `npm`. It is important to note that only tags on the latest commit will be picked up and published. So make sure that you don't make any changes, that you want in the release, after you've run `lerna version`.

### Alpha releases
Should you want to release an `alpha` then run
```sh
# On master
git pull
lerna version --conventional-commits --conventional-prerelease
```
This will append `-alpha.<alpha-version>` to the release name. The alpha release can be graduated (`1.0.1-alpha.1` => `1.0.1`) by running
```sh
# On master
lerna version --conventional-commits --conventional-graduate
```
