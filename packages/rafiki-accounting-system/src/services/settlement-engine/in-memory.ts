import {RemoteSettlementEngine, SettlementEngine, SettlementEngineService} from '.'

export class InMemorySettlementEngineService implements SettlementEngineService {

  private _settlementEngines: Map < string, SettlementEngine >

  constructor () {
    this._settlementEngines = new Map<string, SettlementEngine>()
  }

  public async get (id: string) {
    const settlementEngine = this._settlementEngines.get(id)
    if (!settlementEngine) throw new Error('Settlement Engine Not Found')
    return settlementEngine
  }

  public async add (id: string, url: string) {
    if (this._settlementEngines.get(id)) throw new Error('Settlement Engine already exists')
    const settlementEngine = new RemoteSettlementEngine(url)
    this._settlementEngines.set(id, settlementEngine)
  }

  public async remove (id: string) {
    if (!this._settlementEngines.get(id)) throw new Error('Settlement Engine does not exist')
    this._settlementEngines.delete(id)
  }

}
