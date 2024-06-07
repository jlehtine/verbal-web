import { describeError } from "../shared/error";
import { RequestContext } from "./RequestContext";

/** Prefix used for logging */
const LOG_PREFIX = "Chat %s [%s @ %s]: ";

let logLevel = 1;

function contextParams(ctx: RequestContext): [string, string, string] {
    return [ctx.chatId, ctx.userEmail ?? "<anon>", ctx.sourceIp ?? "<unknown>"];
}

export function setLogLevel(level: number) {
    logLevel = level;
}

export function logFatal(msg: string, ...params: unknown[]) {
    console.error(msg, ...params);
    return process.exit(1);
}

export function logError(msg: string, ctx?: RequestContext, ...params: unknown[]) {
    if (ctx) {
        console.error(LOG_PREFIX + msg, ...contextParams(ctx), ...params);
    } else {
        console.error(msg, ...params);
    }
}

export function logThrownError(msg: string, err: unknown, ctx?: RequestContext, ...params: unknown[]) {
    logError(describeError(err, true, msg), ctx, ...params);
}

export function logInfo(msg: string, ctx?: RequestContext, ...params: unknown[]) {
    if (logLevel >= 1) {
        if (ctx) {
            console.info(LOG_PREFIX + msg, ...contextParams(ctx), ...params);
        } else {
            console.info(msg, ...params);
        }
    }
}

export function logDebug(msg: string, ctx?: RequestContext, ...params: unknown[]) {
    if (logLevel >= 2) {
        if (ctx) {
            console.debug(LOG_PREFIX + msg, ...contextParams(ctx), ...params);
        } else {
            console.debug(msg, ...params);
        }
    }
}

export function logTrace(msg: string, ctx?: RequestContext, ...params: unknown[]) {
    if (logLevel >= 3) {
        if (ctx) {
            console.debug(LOG_PREFIX + msg, ...contextParams(ctx), ...params);
        } else {
            console.debug(msg, ...params);
        }
    }
}

export function logInterfaceData(msg: string, ctx: RequestContext, data: unknown, ...params: unknown[]) {
    if (logLevel >= 3) {
        logDebug(msg + ": " + JSON.stringify(data, undefined, 2), ctx, ...params);
    }
}
