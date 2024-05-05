/**
 * Describes a catched error.
 *
 * @param err catched error
 * @param includeStack whether to include stack trace in the error description
 * @param baseMsg base message added in front of the error description
 * @returns error description
 */
export function describeError(err: unknown, includeStack = false, baseMsg?: string): string {
    let details;
    if (err instanceof Error) {
        details = `${err.name}: ${err.message}` + (includeStack && err.stack ? `\n${err.stack}` : "");
    } else if (typeof err === "string") {
        details = err;
    } else if (typeof err === "object" && err !== null) {
        details = err.constructor.name;
    } else {
        return "Unrecognized error";
    }
    return (baseMsg !== undefined ? baseMsg + ": " : "") + details;
}
