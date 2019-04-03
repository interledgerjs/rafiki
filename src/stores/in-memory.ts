import { StoreInstance } from '../types/store'

export class InMemoryMapStore implements StoreInstance  {
  map: Map<string, string> = new Map()
  async get (key: string): Promise<string | undefined> {
    return this.map.get(key)
  }

  async put (key: string, value: string) {
    this.map.set(key, value)
  }

  async del (key: string) {
    this.map.delete(key)
  }
}
