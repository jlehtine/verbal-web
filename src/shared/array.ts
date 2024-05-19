/**
 * Returns the last entry of an array.
 *
 * @param array array
 * @returns last entry in the array, or undefined if empty
 */
export function lastOf<T>(array: T[]): T | undefined {
    return array.length > 0 ? array[array.length - 1] : undefined;
}
