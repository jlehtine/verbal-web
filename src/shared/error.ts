/** Generic base class for Verbal Web errors */
export class VerbalWebError extends Error {
    constructor(msg: string, options?: ErrorOptions) {
        super(msg, options);
        this.name = "VerbalWebError";
    }
}

/** Signals a configuration issue */
export class VerbalWebConfigurationError extends VerbalWebError {
    constructor(msg: string, options?: ErrorOptions) {
        super(msg, options);
        this.name = "VerbalWebConfigurationError";
    }
}

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
        details =
            err.name + (err.message ? ": " + err.message : "") + (includeStack && err.stack ? `\n${err.stack}` : "");
    } else if (typeof err === "string") {
        details = err;
    } else if (typeof err === "object" && err !== null) {
        details = err.constructor.name;
    } else {
        return "Unrecognized error";
    }
    return (baseMsg !== undefined ? baseMsg + ": " : "") + details;
}
