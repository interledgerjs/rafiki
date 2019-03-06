// import 'mocha'
// import * as sinon from 'sinon'
// import * as Chai from 'chai'
// import * as chaiAsPromised from 'chai-as-promised'
// import BtpPlugin from 'ilp-plugin-btp';
// import { PluginEndpoint } from '../../../src/legacy/plugin-endpoint';
// import { PluginInstance } from '../../../src/legacy/plugin';
// import App from '../../../src/legacy/app';
// import { IlpPrepare, serializeIlpFulfill, IlpFulfill, deserializeIlpPacket, serializeIlpPrepare, deserializeIlpFulfill, deserializeIlpPrepare } from 'ilp-packet';
// import { randomBytes, createHash } from 'crypto';
// Chai.use(chaiAsPromised)
// const assert = Object.assign(Chai.assert, sinon.assert)

// function sha256 (preimage: Buffer) { return createHash('sha256').update(preimage).digest() }
// const fulfillment = randomBytes(32)
// const condition = sha256(fulfillment)
// const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

// describe.skip('Basic Integration', function () {
//   let app: App
//   let bobBtpServer: BtpPlugin
//   let bobBtpClient: BtpPlugin
//   let bobLegacyEndpoint: PluginEndpoint
//   let johnBtpServer: BtpPlugin
//   let johnBtpClient: BtpPlugin
//   let johnLegacyEndpoint: PluginEndpoint


//   beforeEach( async function () {
//     bobBtpServer = new BtpPlugin({
//       listener: {
//         port: 9000,
//         secret: 'shh_its_a_secret'
//       }
//     })
//     bobBtpClient = new BtpPlugin({
//       server: 'btp+ws://:shh_its_a_secret@localhost:9000'
//     })
//     johnBtpServer = new BtpPlugin({
//       listener: {
//         port: 9001,
//         secret: 'shh_its_a_secret'
//       }
//     })
//     johnBtpClient = new BtpPlugin({
//       server: 'btp+ws://:shh_its_a_secret@localhost:9001'
//     })

//     await Promise.all([
//       bobBtpServer.connect(),
//       bobBtpClient.connect(),
//       johnBtpServer.connect(),
//       johnBtpClient.connect(),
//     ])

//     bobLegacyEndpoint = new PluginEndpoint((bobBtpServer as unknown) as PluginInstance)
//     johnLegacyEndpoint = new PluginEndpoint((johnBtpServer as unknown) as PluginInstance)

//     app = new App({
//       env: 'test',
//       accounts: {
//         'bob-ledger': {
//           relation: 'peer',
//           assetCode: 'CAD',
//           assetScale: 4,
//           endpoint: bobLegacyEndpoint,
//           options: {}
//         },
//         'john-ledger': {
//           relation: 'child',
//           assetCode: 'CAD',
//           assetScale: 4,
//           endpoint: johnLegacyEndpoint,
//           options: {}
//         }
//       },
//       ilpAddress: 'test.connie',
//       minMessageWindow: 1000
//     })
//   })

//   afterEach(async function () {
//     if(app) app.shutdown()
//     await Promise.all([
//       bobBtpServer.disconnect(),
//       bobBtpClient.disconnect(),
//       johnBtpServer.disconnect(),
//       johnBtpClient.disconnect(),
//     ])
//   })

//   it('can route a packet through the connector', async function() {
//     await app.start()
//     const preparePacket: IlpPrepare = {
//       amount: '49',
//       executionCondition: condition,
//       expiresAt: new Date(Date.now() + 2000),
//       destination: 'test.connie.john-ledger',
//       data: Buffer.alloc(0)
//     }
//     const fulfillPacket: IlpFulfill = {
//       fulfillment: fulfillment,
//       data: Buffer.from('')
//     }

//     johnBtpClient.registerDataHandler((data: Buffer) => {
//       return Promise.resolve(serializeIlpFulfill(fulfillPacket))
//     })
//     const result = await bobBtpClient.sendData(serializeIlpPrepare(preparePacket))
//     assert.deepEqual(deserializeIlpFulfill(result), fulfillPacket)
//   })

//   it("reduces the expirey by minMessageWindow", async function () {
//     this.clock = sinon.useFakeTimers(new Date(START_DATE))
//     await app.start()
//     let packetJohnReceived = {} as IlpPrepare
//     const preparePacket: IlpPrepare = {
//       amount: '49',
//       executionCondition: condition,
//       expiresAt: new Date(START_DATE + 2000),
//       destination: 'test.connie.john-ledger',
//       data: Buffer.alloc(0)
//     }
//     const fulfillPacket: IlpFulfill = {
//       fulfillment: fulfillment,
//       data: Buffer.from('')
//     }

//     johnBtpClient.registerDataHandler((data: Buffer) => {
//       packetJohnReceived = deserializeIlpPrepare(data)
//       return Promise.resolve(serializeIlpFulfill(fulfillPacket))
//     })
//     await bobBtpClient.sendData(serializeIlpPrepare(preparePacket))

//     assert.deepEqual(packetJohnReceived.expiresAt, new Date(START_DATE + 1000))
//     this.clock.restore()
//   })
// })