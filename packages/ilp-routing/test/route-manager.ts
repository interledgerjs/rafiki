import * as Chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import 'mocha';
import * as sinon from 'sinon';
import { Router } from '../src';
import { RouteManager } from '../src/ilp-route-manager'
import { Peer } from '../src/ilp-route-manager/peer';
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('ilp-route-manager', function () {
  let router: Router

  beforeEach(function () {
    router = new Router()
  })

  describe('instantiation', function () {

    it('can be instantiated', function () {
      let routeManager = new RouteManager(router)

      assert.instanceOf(routeManager, RouteManager)
    })
  })

  describe('peer', function () {
    it('can add a peer', function () {
      let routeManager = new RouteManager(router)

      routeManager.addPeer('harry', 'peer')

      const peer = routeManager.getPeer('harry')
      assert.isDefined(routeManager.getPeer('harry'))
      assert.instanceOf(peer, Peer)
    })

    it('can remove a peer', function () {
      let routeManager = new RouteManager(router)

      routeManager.removePeer('harry')

      assert.isUndefined(routeManager.getPeer('harry'))
    })

    it('can get all peers', function () {
      let routeManager = new RouteManager(router)

      routeManager.addPeer('harry', 'peer')
      
      const peers = routeManager.getPeerList()
      assert.deepEqual(peers, ['harry'])
    })
  })

  describe('route', function () {
    let routeManager: RouteManager
    let peer: Peer | undefined

    beforeEach(function () {
      routeManager = new RouteManager(router)
      routeManager.addPeer('harry', 'peer')
      peer = routeManager.getPeer('harry')
    })

    describe('adding', function () {
      it('adding a route adds it to peer routing table', function () {
        routeManager.addRoute({
          peer: 'harry',
          prefix: 'g.harry',
          path: []
        })
  
        const route = peer!.getPrefix('g.harry')
  
        assert.deepEqual(route, {
          peer: 'harry',
          prefix: 'g.harry',
          path: []
        })
      })

      it('adding a better route adds it to the routingTable', function () {
        routeManager.addPeer('mary', 'child')
        routeManager.addRoute({
          peer: 'harry',
          prefix: 'g.nick',
          path: ['g.potter']
        })

        routeManager.addRoute({
          peer: 'mary',
          prefix: 'g.nick',
          path: []
        })
    
        const nextHop = router.nextHop('g.nick')
        assert.equal(nextHop, 'mary')
      })

      it('adding a worse route does not update routing table', function () {
        routeManager.addPeer('mary', 'child')
        routeManager.addRoute({
          peer: 'harry',
          prefix: 'g.harry',
          path: []
        })

        routeManager.addRoute({
          peer: 'mary',
          prefix: 'g.harry',
          path: ['g.turtle']
        })
    
        const nextHop = router.nextHop('g.harry')
        assert.equal(nextHop, 'harry')
      })
    })

    // Section for testing weighting stuff
    describe('weighting', function () {

    })

    
    it('removing a route removes from peer routing table', function () {
      routeManager.addRoute({
        peer: 'harry',
        prefix: 'g.harry',
        path: []
      })

      routeManager.removeRoute('harry', 'g.harry')

      const route = peer!.getPrefix('g.harry')
      assert.isUndefined(route)
    })

    it('does not add a route for a peer that does not exist', function () {
      routeManager.addRoute({
        peer: 'mary',
        prefix: 'g.harry',
        path: []
      })

      let nextHop = router.getRoutingTable().get('g.harry')
      assert.isUndefined(nextHop)
    })

    it('removing a peer should remove all its routes from the routing table', function() {
      routeManager.addRoute({
        peer: 'harry',
        prefix: 'g.harry',
        path: []
      })
      assert.isDefined(router.getRoutingTable().get('g.harry'))

      routeManager.removePeer('harry')

      assert.isUndefined(router.getRoutingTable().get('g.harry'))
    })

  })
})