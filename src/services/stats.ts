import * as Prometheus from 'prom-client'
import { PeerInfo } from '../types/peer'

function mergeAccountLabels (peer: PeerInfo, labels: Prometheus.labelValues): Prometheus.labelValues {
  labels['account'] = peer.id
  labels['asset'] = peer.assetCode
  labels['scale'] = peer.assetScale
  return labels
}

export class PeerCounter extends Prometheus.Counter {
  constructor (configuration: Prometheus.CounterConfiguration) {
    configuration.labelNames = (configuration.labelNames || [])
    configuration.labelNames.push('account', 'asset', 'scale')
    super(configuration)
  }
  increment (peer: PeerInfo, labels: Prometheus.labelValues, value?: number) {
    return this.inc(mergeAccountLabels(peer, labels), value)
  }
}

export class PeerGauge extends Prometheus.Gauge {
  constructor (configuration: Prometheus.GaugeConfiguration) {
    configuration.labelNames = (configuration.labelNames || [])
    configuration.labelNames.push('account', 'asset', 'scale')
    super(configuration)
  }
  setValue (peer: PeerInfo, labels: Prometheus.labelValues, value: number) {
    return this.set(mergeAccountLabels(peer, labels), value)
  }
}

export class Stats {
  public incomingDataPackets: PeerCounter
  public incomingDataPacketValue: PeerCounter
  public outgoingDataPackets: PeerCounter
  public outgoingDataPacketValue: PeerCounter
  public incomingMoney: PeerGauge
  public outgoingMoney: PeerGauge
  public rateLimitedPackets: PeerCounter
  public rateLimitedMoney: PeerCounter
  public balance: PeerGauge
  private registry: Prometheus.Registry

  constructor () {
    this.registry = new (Prometheus.Registry)()

    this.incomingDataPackets = new PeerCounter({
      name: 'ilp_connector_incoming_ilp_packets',
      help: 'Total number of incoming ILP packets',
      labelNames: [ 'result', 'code'],
      registers: [this.registry]
    })

    this.incomingDataPacketValue = new PeerCounter({
      name: 'ilp_connector_incoming_ilp_packet_value',
      help: 'Total value of incoming ILP packets',
      labelNames: [ 'result', 'code'],
      registers: [this.registry]
    })

    this.outgoingDataPackets = new PeerCounter({
      name: 'ilp_connector_outgoing_ilp_packets',
      help: 'Total number of outgoing ILP packets',
      labelNames: [ 'result', 'code' ],
      registers: [this.registry]
    })

    this.outgoingDataPacketValue = new PeerCounter({
      name: 'ilp_connector_outgoing_ilp_packet_value',
      help: 'Total value of outgoing ILP packets',
      labelNames: [ 'result', 'code' ],
      registers: [this.registry]
    })

    this.incomingMoney = new PeerGauge({
      name: 'ilp_connector_incoming_money',
      help: 'Total of incoming money',
      labelNames: [ 'result' ],
      registers: [this.registry]
    })

    this.outgoingMoney = new PeerGauge({
      name: 'ilp_connector_outgoing_money',
      help: 'Total of outgoing money',
      labelNames: [ 'result' ],
      registers: [this.registry]
    })

    this.rateLimitedPackets = new PeerCounter({
      name: 'ilp_connector_rate_limited_ilp_packets',
      help: 'Total of rate limited ILP packets',
      registers: [this.registry]
    })

    this.rateLimitedMoney = new PeerCounter({
      name: 'ilp_connector_rate_limited_money',
      help: 'Total of rate limited money requests',
      registers: [this.registry]
    })

    this.balance = new PeerGauge({
      name: 'ilp_connector_balance',
      help: 'Balances on peer account',
      registers: [this.registry]
    })
  }

  getStatus () {
    return this.registry.getMetricsAsJSON()
  }
}
