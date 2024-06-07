export function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object";
}

export function isHexBytes(v: unknown): v is string {
    return typeof v === "string" && v.match(/^([0-9a-fA-F]{2})+$/) !== null;
}
