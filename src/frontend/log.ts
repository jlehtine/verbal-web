import { describeError } from "../shared/error";

// The environment variable passed in by WebPack during compilation
declare global {
    let process: {
        env: {
            NODE_ENV: unknown;
        };
    };
}

const VERBAL_WEB_PREFIX = "Verbal Web: ";

/**
 * Logs at the debug level if not compiled in production mode.
 *
 * @param msg message
 * @param params parameters
 */
export function logDebug(msg: string, ...params: unknown[]) {
    if (isInDevelopment()) {
        console.debug(VERBAL_WEB_PREFIX + msg, ...params);
    }
}

/**
 * Logs at the error level.
 *
 * @param msg message
 * @param params parameters
 */
export function logError(msg: string, ...params: unknown[]) {
    console.error(VERBAL_WEB_PREFIX + msg, ...params);
}

/**
 * Logs a thrown error.
 * @param err error
 * @param baseMsg base message
 */
export function logThrownError(msg: string, err: unknown) {
    console.error(describeError(err, isInDevelopment(), VERBAL_WEB_PREFIX + msg));
}

function isInDevelopment() {
    return process.env.NODE_ENV !== "production";
}
