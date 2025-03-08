export function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object";
}

export function isHexBytes(v: unknown): v is string {
    return typeof v === "string" && /^([0-9a-fA-F]{2})+$/.exec(v) !== null;
}

export function isFloat32Array3(v: unknown): v is Float32Array[][] {
    return (
        Array.isArray(v) &&
        v.every((stream) => Array.isArray(stream) && stream.every((channel) => channel instanceof Float32Array))
    );
}
