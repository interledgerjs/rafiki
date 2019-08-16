export * from './heartbeat'
export * from './liquidity-check'
export * from './max-packet-amount'
export * from './rate-limit'
export * from './reduce-expiry'
export * from './throughput'
export * from './validate-fulfillment'

// export function createDefaultMiddleware () {
//   const incoming = compose([
//     // Incoming Rules
//     createIncomingHeartbeatMiddleware({
//       heartbeatInterval: 5 * 60 * 1000,
//       onFailedHeartbeat: (peerId: string) => {
//         // TODO: Handle failed heartbeat
//       },
//       onSuccessfulHeartbeat: (peerId: string) => {
//         // TODO: Handle successful heartbeat
//       }
//     }),
//     createIncomingErrorHandlerMiddleware(),
//     createIncomingMaxPacketAmountMiddleware(),
//     createIncomingRateLimitMiddleware(),
//     createIncomingThroughputMiddleware(),
//     createIncomingReduceExpiryMiddleware(),
//     createIncomingBalanceMiddleware()
//   ])
//
//   const outgoing = compose([
//     // Outgoing Rules
//     createOutgoingBalanceMiddleware(),
//     createOutgoingThroughputMiddleware(),
//     createOutgoingReduceExpiryMiddleware(),
//     createOutgoingExpireMiddleware(),
//     createOutgoingValidateFulfillmentMiddleware(),
//
//     // Send outgoing packets
//     createClientController()
//   ])
//
//   return compose([
//     incoming,
//     outgoing
//   ])
// }
