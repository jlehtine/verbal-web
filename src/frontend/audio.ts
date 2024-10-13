export type AudioErrorCode = "general" | "notfound" | "notallowed" | "processing";

export function toAudioErrorCode(err: unknown): AudioErrorCode {
    if (typeof err === "object") {
        if (err instanceof DOMException) {
            const name = err.name;
            if (name === "NotFoundError" || name === "OverconstrainedError") {
                return "notfound";
            } else if (name === "NotAllowedError" || name === "SecurityError") {
                return "notallowed";
            }
        }
    }
    return "general";
}
