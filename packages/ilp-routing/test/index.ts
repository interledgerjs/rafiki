import * as Chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import 'mocha';
import * as sinon from 'sinon';
import { Router } from '../src';
import { AssertionError } from 'assert';
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('ilp-router', function () {

  describe('routes', function() {

    let router: Router

    beforeEach( function() {
      router = new Router()
    })

    it('can add a route for a peer', function() {
      router.addRoute('g.harry', {
          nextHop: 'harry',
          path: [],
      })

      const table = router.getRoutingTable()

      assert.isTrue(table.keys().includes('g.harry'))
      assert.deepEqual(table.resolve('g.harry.sally'), {
        nextHop: 'harry',
        path: []
      })
    })

    it('can remove a route for a peer', function() {
      router.addRoute('g.harry', {
        nextHop: 'harry',
        path: [],
    })

      router.removeRoute('g.harry')

      const table = router.getRoutingTable()
      assert.isFalse(table.keys().includes('g.harry'))
      assert.isUndefined(table.resolve('g.harry.sally'))
    })
  })

  describe('nextHop', function() {
    let router: Router

    beforeEach( function() {
      router = new Router()
      router.addRoute('g.harry', {
        nextHop: 'harry',
        path: [],
      })
    })

    it('returns peerId if nextHop called for route to a peer', function() {
      const nextHop = router.nextHop('g.harry.met.sally')
      assert.equal(nextHop, 'harry')
    })

    it('throws an error if can\'t route request', function() {
      assert.throws(() => router.nextHop('g.sally'))
    })
  })

  describe('weighting', function() {

  })

  //TODO: Need to add functionality to check that adding a route propagates to the forwardingRoutingTable or perhaps the Route Manager should handle that?
})