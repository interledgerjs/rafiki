// import 'mocha'
// import * as sinon from 'sinon'
// import * as Chai from 'chai'
// import * as chaiAsPromised from 'chai-as-promised'
// import BtpPlugin from 'ilp-plugin-btp';
// import { PluginEndpoint } from '../../../src/legacy/plugin-endpoint'
// import { PluginInstance } from '../../../src/legacy/plugin'
// import App from '../../../src/legacy/app'
// Chai.use(chaiAsPromised)
// const assert = Object.assign(Chai.assert, sinon.assert)

// describe.skip('Peer-Child topology:', function () {
//   it('child connector gets address from parent connector', async function () {
//     const btpServerPlugin = new BtpPlugin({
//       listener: {
//         port: 9003,
//         secret: 'shh_its_a_secret'
//       }
//     })
//     const btpClientPlugin = new BtpPlugin({
//       server: 'btp+ws://:shh_its_a_secret@localhost:9003'
//     })
//     const serverEndpoint = new PluginEndpoint((btpServerPlugin as unknown) as PluginInstance)
//     const clientEndpoint = new PluginEndpoint((btpClientPlugin as unknown) as PluginInstance)
//     await Promise.all([
//       btpServerPlugin.connect(),
//       btpClientPlugin.connect()
//     ])

//     const parent = new App({
//       ilpAddress: 'test.connie',
//       env: 'test',
//       accounts: {
//         'alice': {
//           'relation': 'child',
//           'assetScale': 2,
//           'assetCode': 'USD',
//           'endpoint': serverEndpoint
//         }
//       }
//     })

//     const child = new App({
//       env: 'test',
//       accounts: {
//         'connie': {
//           'relation': 'parent',
//           'assetScale': 2,
//           'assetCode': 'USD',
//           'endpoint': clientEndpoint
//         }
//       }
//     })

//     await Promise.all([
//       parent.start(),
//       child.start()
//     ])

//     assert.equal('test.connie.alice', child.connector.getOwnAddress())

//     await Promise.all([
//       btpServerPlugin.disconnect(),
//       btpClientPlugin.disconnect(),
//       parent.shutdown(),
//       child.shutdown(),
//     ])
//   })
// })