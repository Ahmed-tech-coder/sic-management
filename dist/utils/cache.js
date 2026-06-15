"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryCache = void 0;
class MemoryCache {
    cache = new Map();
    /**
     * Retrieves an item from the cache. Returns null if expired or not found.
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item)
            return null;
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }
    /**
     * Sets an item in the cache with a specified TTL in milliseconds.
     */
    set(key, value, ttlMs) {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
    }
    /**
     * Deletes a specific key from the cache.
     */
    delete(key) {
        this.cache.delete(key);
    }
    /**
     * Clears all cache keys matching a regular expression pattern.
     */
    clearPattern(pattern) {
        for (const key of this.cache.keys()) {
            if (pattern.test(key)) {
                this.cache.delete(key);
            }
        }
    }
    /**
     * Clears the entire cache.
     */
    clear() {
        this.cache.clear();
    }
}
exports.memoryCache = new MemoryCache();
