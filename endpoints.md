# endpoints

Endpoints are the abstraction of a connection to another system that sends and receives ILP packets. Rafiki ships with built-in endpoints for http2, websockets and raw TCP.

### Sending

```
endpoint.sendOutgoingRequest(request[,callback]) => Promise
```

To send a request it is passed to the `sendOutgoingRequest` method along with an optional callback that is invoked when the send is complete. The method returns a Promise that will resolve to the reply from the remote system.

### Receiving

```
endpoint.setIncomingRequestHandler(handler) => this
```

To begin receiving requests the receiver sets a handler on the endpoint by calling `setIncomingRequestHandler` and passing a function that accepts a request and returns a Promise that resolves to a reply.

The TypeScript interface definition is [here](./src/endpoint.ts)

## Request Streams

In Rafiki we also provide an implementation of a simple protocol for exchanging ILP packets in request/reply pairs over an ordered byte stream. We call these **Request Streams**.

Request Streams are streams of messages where each message has a **correlation id** that is unique to a request/reply pair.

In Rafiki we define a `MessageFrame` object, which, when encoded is simply an OER encoded `IlpPacket` prefixed by a fixed length (32 bit) id.

`MessageFrame`s can be sent over any underlying stream where the stream has an existing message framing protocol (e.g. WebSockets) or over a stream that guarantees packet ordering and delivery (e.g. TCP).

While untested, an implementation could reject messages that are too large to fit into a single datagram and simply send messages over a protocol such as UDP with a single message per datagram. The maximum size of ILP packets should allow for this in theory.

This work is based upon previous protocols and experiments with details on some of the design decisions provided below. Most importantly the protocol does not bind itself to an underlying message transport OR session establishment protocol but can use whatever is appropriate for the situation.

For example, client-server connections can leverage the existing session establishment through an HTTP handshake and the efficient message framing of WebSockets. Where-as a host-to-host connection may use a raw TLS connection with session establishment leveraging the TLS handshake and framing done simply through use of a message separator.

### MessageFrame

The protocol is very simple as it leverages some of the existing fields in an ILP packet to exercise features required in request/reply protocols such as request expiry and message type indicators. 

The protocol involves the exchange of `MessageFrame`s where each `MessageFrame` has a fixed length header and an ILP packet as payload. The header is a fixed length `correlation id` used to match requests and replies.

| Field          | Type       | Size     | Description                              |
|----------------|------------|----------|------------------------------------------|
| Correlation ID | UInt32BE   | 4 bytes  | ID of the message                        |
| Payload        | ILP Packet | Variable | An ILP Prepare, Fulfill or Reject packet |

The TypeScript interface representation is as follows (where the payload is expected to be an ILP packet):

```typescript
export interface MessageFrame<Request, Reply> {
  id: number
  payload: Request | Reply
}
```

## Request/Reply

All messages are exchanged as request/reply pairs. A request will always contain an _ILP Prepare_ packet and a reply will always contain either an _ILP Fulfill_ or an _ILP Reject_ packet.

Requests and replies are correlated based on the `correlation id`. A request will have the same `correlation id` as the corresponding reply.

Since we have restricted our payload to only 3 possible types we can use the type indicator byte from the payload to differentiate between a request (ILP Prepare payload) and a reply (ILP Fulfill or ILP Reject payload). This makes it easy for implementations to differentiate between a new request and an unsolicited reply.

As you can see from the format of an ILP packet the type is the first byte of the packet and will therefor always be the 5th byte in a `MessageFrame`.

| Field | Type                         | Description                                 |
|-------|------------------------------|---------------------------------------------|
| type  | UInt8                        | ID of the ILP Packet type                   |
| data  | Variable-Length Octet String | Packet contents, prefixed with their length |

## Expiry

Requests expire based upon the value of the `expiresAt` field in the ILP packet. An endpoint should only forward replies to a request as long as they are received before the time indicated by the `expiresAt` value in the corresponding request.

## Correlation ID

The `correlation id` is an *unsigned 32-bit integer* that must be unique per message for the lifetime of the request.

## In-flight vs Completion

A request is considered *complete* as soon as any of the following occur:
 - The sending endpoint receives a reply to the request
 - The request expires 

Until a request is complete it is *in-flight*.

If an endpoint receives a request with the same `correlation id` as a request that is currently in-flight it MUST discard the request. Once a request is complete an endpoint MAY accept another request with the same `correlation id` however it MAY also discard this message (this simplifies implementations as an endpoint is only forced to keep track of in-flight requests).

As a result, endpoints SHOULD avoid re-using the same `correlation id` during the same session as these may be silently discarded by the other endpoint.

Endpoints SHOULD use a value of `1` (`0x00000001`) for the `correlation id` of the first message sent in a session and increment this for each subsequent message. Endpoints MAY reset the `correlation id` to `1` when establishing a new session.

Endpoints SHOULD avoid using a value of `0` as this is `falsy` and may have unintended side-effects.

## Sessions

When two endpoints create a connection they must establish a session.

The protocol for establishing the session may include exchanging messages using this protocol or may be a separate handshake protocol (e.g. an HTTP handshake for WebSockets).

At a minimum the following session properties must be established between the endpoints before the session is active and  packets can be exchanged:

  1. The identity of the counter-party endpoint
  2. The relation between the two endpoints (`parent`, `child` or `peer`)
  3. The asset and scale for amounts sent in subsequent ILP packets

## Endpoints and ILP Reject messages

An endpoint SHOULD NOT generate ILP Reject messages. If there is an error sending a request this should be thrown and the caller should determine if it is appropriate to generate a new ILP Reject to pass upstream or not.

Callers should also wrap the handler provided to the endpoint in such a way as to catch errors thrown when it is invoked by the endpoint.

## Life-cycle Management

The interface intentionally does not contain life-cycle management functions. When an endpoint is passed to another component to use for sending/receiving ILP packets it should be assumed that the endpoint is connected to the remote host.

Callers MUST assume that all requests will be sent

## Javascript Interface

One of the goals of this design is to make consuming the interface simple. It is better for implementations to handle complexity than to make the interface itself complex (although other design decisions have been made to also simplify implementations as much as possible).

### Sending

Therefor the interface for sending an `IlpMessage` is simply:

```javascript
endpoint.sendOutgoingRequest(ilpPrepare[, sentCallback])
```
#### Parameters

  - `ilpPrepare`: is an ILP Prepare object
  - `sentCallback`: is an optional callback that is invoked by the underlying stream when the message is sent

#### Return value

The function returns a `Promise` that resolves to either an ILP Fulfill or an ILP Reject object.

#### Description

The caller passes in an ILP Prepare and gets a Promise that resolves to either an ILP Fulfill or ILP Reject object. If the Promise is rejected then the endpoint timed out waiting for the reply.

The caller can optionally provide a callback that is called when the send is complete. The callback has one optional parameter, an `Error` which is present if there was a send error. This matches the signatures of most underlying streams and allows the caller to monitor if requests are being buffered internally or if there are errors sending the request.

### Receiving

Incoming requests are passed to a handler that is registered with the endpoint via the `setIncomingRequestHandler` method.

#### ILP Request Handlers

An *ILP Request Handler* is a function that accepts an ILP Prepare packet and must return a `Promise` that resolves to either an ILP Fulfill or an ILP Reject object.

### Interface Definition

The complete interface of an endpoint is defined using Typescript in: [endpoint.ts](./src/endpoint.ts)

### Default Implementation

The default implementation, [`IlpStreamEndpoint`](./src/ilp.ts), is very simple. It manages request/reply correlation and request expiry.

It implements the stream.Duplex interface so it can be piped to any outgoing byte stream and any incoming byte stream can be piped into it.

#### WebSockets

A function, [createIlpWebSocketEndpoint](./src/ilp-ws.ts) is provided that wraps a WebSocket connection and returns an [`Endpoint`](./src/endpoint.ts) interface.

## Design Choices

The following design choices were made based on previous work and experiments such as BTP and ILP-GRPC.

### Fuzzy Abstractions

The Request Stream protocol is intentionally crossing some lines of abstraction for the sake of efficiency. Specifically the transport layer must look into the ILP packet payload for the expiry and message type.

Experiments done so far with more distinct separation between the transport layer and the ILP layer suggest that this is over-engineering and that a lot of functionality is repeated unnecessarily.

As an example, tracking an expiry for a request message that is different to the expiry of the ILP Prepare payload is pointless and adds unnecessary complexity. Likewise, defining a unique set of error codes for the transport layer adds little value.

### Correlation ID

Using a 32-bit unsigned integer allows a large number of messages to be exchanged before the id must be rolled over.

It is also small enough to be expressed natively in all programming languages which makes implementations significantly simpler and likely more performant.

For example, reading the correlation id from the message in Javascript is very efficient:
```js
  const id = message.readUInt32BE(4)
  const packet = message.slice(4)
```

### Idempotency

Most request/reply protocols define requests as being idempotent however this adds a lot of complexity to the implementation. Rather this protocol only requires an endpoint to track in-flight requests (i.e. not yet complete).

Given that ILP packets should only be in flight for a very short time this seems like a fair compromise over complex request tracking logic.

### Sub-Protocols

In comparison to previous bi-lateral protocols this protocol does not support sub-protocols. In contrast it favours simplicity and only transmits ILP packets.

Where sub-protocols were used previously they were always bi-lateral and therefor could be replaced with either:
  1. A separate, sub-protocol specific connection
  2. A protocol implemented using ILP packets and the `peer.*` address-space (see below)

### Transfers and Settlement

BTP defined a separate message type for transfers which adds complexity but very little value over using a sub-protocol or an ILP packet-based protocol for exchanging the same messages.

This protocol does away with this and proposes to use ILP packets.

A `BTP.Transfer` message is replaced with an ILP Prepare where the address prefix is `peer.settle` and the amount is the settlement amount.

Specializations of this can be defined for different settlement systems and identified by using additional address segments. For example an XRP Paychan settlement protocol could send packets with the address `peer.settle.xrp-paychan`.

The condition and fulfillment use static values of `SHA256(32 * 0x00)` and `32 * 0x00` respectively although alternative protocols MAY choose to use different values.

### peer.* addresses

This proposal deprecates some functions of BTP in favour of messages in ILP packets using the `peer.*` address space. These new "sub-protocols" SHOULD use the following hard-coded condition and fulfillment values unless alternatives are determined for a specific use case:

- fulfillment: `0x00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`
- condition:   `0x66 68 7a ad f8 62 bd 77 6c 8f c1 8b 8e 9f 8e 20 08 97 14 85 6e e2 33 b3 90 2a 59 1d 0d 5f 29 25`

#### peer.auth

Some message transports allow for the session to be established during connection establishment. For example: 

  - WebSockets have an HTTP handshake that allows both parties to exchange session information prior to sending messages over the new connection. 
  - TLS connections can be secured using client and server certificates and the session information can be linked to the server and client identities.
  - gRPC has a mechanism for both securing a channel and exchanging channel metadata (session information) 

Where this is not possible or desirable a session can be established by using an exchange of packets in the `peer.auth` address space.

The endpoint requesting the session sends an ILP Prepare with the `destination` of `peer.auth`, an amount of `0`, the static `executionCondition` value of `0x66 68 7a ad f8 62 bd 77 6c 8f c1 8b 8e 9f 8e 20 08 97 14 85 6e e2 33 b3 90 2a 59 1d 0d 5f 29 25`, an appropriate `expiresAt` value (e.g. 10 seconds from now).

The value of the `data` field in the packet is agreed between the parties ahead of time and may be a shared secret, a bearer token or any other value that the receiving endpoint will use to authenticate the sending endpoint.

If the auth request is successful the receiving endpoint sends back an ILP Fulfill response. The `fulfillment` is all zeros and the `data` MAY contain an IL-DCP response including the address of the sending endpoint, and the asset scale and asset code of subsequent packets exchanged in the session.

#### peer.settle

See [Transfers and Settlement](#transfers-and-settlement) above.