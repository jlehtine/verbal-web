let logLevel = 1;

export function setLogLevel(level: number) {
    logLevel = level;
}

export function logFatal(msg: string, ...params: unknown[]) {
    console.error(msg, ...params);
    return process.exit(1);
}

export function logError(msg: string, ...params: unknown[]) {
    console.error(msg, ...params);
}

export function logInfo(msg: string, ...params: unknown[]) {
    if (logLevel >= 1) {
        console.info(msg, ...params);
    }
}

export function logDebug(msg: string, ...params: unknown[]) {
    if (logLevel >= 2) {
        console.debug(msg, params);
    }
}
