declare module 'lru-cache' {
  interface Options<K, V> {
    max?: number
    ttl?: number
    ttlAutopurge?: boolean
    maxSize?: number
    sizeCalculation?: (value: V, key: K) => number
  }

  class LRUCache<K, V> {
    constructor(options: Options<K, V>)
    get(key: K): V | undefined
    set(key: K, value: V): this
    has(key: K): boolean
    delete(key: K): boolean
    clear(): void
    get size(): number
    keys(): IterableIterator<K>
    values(): IterableIterator<V>
    entries(): IterableIterator<[K, V]>
    forEach(fn: (value: V, key: K, cache: this) => void): void
    purgeStale?(): boolean
    prune?(): void
  }

  export = LRUCache
}
