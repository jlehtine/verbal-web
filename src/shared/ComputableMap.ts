/**
 * A map with on-demand computation of values.
 */
export class ComputableMap<K, V> extends Map<K, V> {
    /**
     * If specified key is present then returns the corresponding value.
     * Otherwise computes the value using the specified function and stores it in the map.
     *
     * @param key key
     * @param mappingFunction function for calculating values on demand
     * @returns value
     */
    computeIfAbsent(key: K, mappingFunction: (key: K) => V) {
        let v = this.get(key);
        if (v === undefined) {
            v = mappingFunction(key);
            this.set(key, v);
        }
        return v;
    }
}
