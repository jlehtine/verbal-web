export function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object";
}
