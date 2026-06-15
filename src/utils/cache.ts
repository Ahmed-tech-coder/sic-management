class MemoryCache {
  private cache = new Map<string, { value: any; expiresAt: number }>();

  /**
   * Retrieves an item from the cache. Returns null if expired or not found.
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value as T;
  }

  /**
   * Sets an item in the cache with a specified TTL in milliseconds.
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Deletes a specific key from the cache.
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clears all cache keys matching a regular expression pattern.
   */
  clearPattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCache();
