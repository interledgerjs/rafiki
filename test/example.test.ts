import { IlpPrepareFactory } from './factories/ilpPacket'
import { PeerInfoFactory } from './factories/peerInfo'

test('Example test', async () => {
  const prepare = IlpPrepareFactory.build({ destination: 'test.rafiki.alice' })
  const peerInfo = PeerInfoFactory.build({ protocols: { 'ildcp': { name: 'ildcp' } } })
  
  expect(prepare.destination).toBe('test.rafiki.alice')
  expect(peerInfo.protocols).toEqual({ 'ildcp': { name: 'ildcp' } })
})
