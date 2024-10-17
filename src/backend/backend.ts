import { SharedConfig } from "../shared/api";
import { InitialChatStateOverrides } from "../shared/chat";
import { ChatServer, ChatServerConfig } from "./ChatServer";
import { Engine } from "./Engine";
import { OpenAIEngine } from "./OpenAIEngine";
import { contextFrom } from "./RequestContext";
import { handleAuthCheck, handleAuthRequest } from "./auth";
import { logFatal, logInfo, logThrownError, setLogLevel } from "./log";
import { httprnderr, pauseRandomErrors, setRandomErrorsEnabled } from "./randomErrors";
import { Session, checkSession, endSession } from "./session";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import { WebSocketExpress } from "websocket-express";

interface StaticContent {
    path?: string;
    dir: string;
}

declare global {
    // Extend the Express.js request object
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        /** Extend request with session information */
        interface Request {
            vwSession?: Session;
        }
    }
}

const DEFAULT_PORT = 3000;

const BASE_PATH = "/vw/";
const CHAT_PATH = BASE_PATH + "chat";

// Usage
function usage() {
    const basename = process.argv[1].replace(/^.*[/\\]/, "");
    console.info(`usage: node ${basename} [option]...

options:
    -h, --help
        print this help text
    -p, --port PORT
        listen to the specified port (default is ${DEFAULT_PORT.toString()})
    --chdir DIR
        switch to DIR on startup
    --static [/PATH:]DIR
        serve static content from DIR either as /PATH or at root,
        repeat the option to serve content from multiple directories
    --trust-proxy TRUST_PROXY_SETTING
        Express.js "trust proxy" setting
    --allow-users (EMAIL|DOMAIN)[,(EMAIL|DOMAIN)]...
        allow users with specified email addresses or domains
    --google-oauth-client-id ID
        enable Google login using the specified OAuth client id
    --session-expiration DAYS
        session expiration time in days (default is 30 days, or a month)
    --disable-speech-to-text
        disable speech-to-text feature, if available
    --disable-realtime
        disable realtime conversation feature, if available
    -v, --verbose
        increase logging, use multiple times for even more verbose logging
    --random-errors
        generate random backend errors, for error testing
`);
}

// Read arguments
let port = process.env.VW_PORT ? parseInt(process.env.VW_PORT) : DEFAULT_PORT;
let chdir = process.env.VW_CHDIR;
const staticContent: StaticContent[] = [];
let trustProxy = parseTrustProxy(process.env.VW_TRUST_PROXY);
let allowUsers = parseAllowUsers(process.env.VW_ALLOW_USERS);
let googleOAuthClientId = process.env.VW_GOOGLE_OAUTH_CLIENT_ID;
let sessionExpirationDays = parseNumber(process.env.VW_SESSION_EXPIRATION) ?? 30;
let enableSpeechToText = parseBoolean(process.env.VW_ENABLE_SPEECH_TO_TEXT) ?? true;
let enableRealtime = parseBoolean(process.env.VW_ENABLE_REALTIME) ?? true;
let logLevel = process.env.VW_LOG_LEVEL ? parseInt(process.env.VW_LOG_LEVEL) : 0;
let randomErrors = process.env.VW_RANDOM_ERRORS !== undefined;
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "-h" || a === "--help") {
        usage();
        process.exit(0);
    }
    if (a === "-p" || a === "--port") {
        port = parseInt(safeNextArg(process.argv, ++i));
    } else if (a === "--chdir") {
        chdir = safeNextArg(process.argv, ++i);
    } else if (a === "--static") {
        staticContent.push(parseStatic(safeNextArg(process.argv, ++i)));
    } else if (a === "--trust-proxy") {
        trustProxy = parseTrustProxy(safeNextArg(process.argv, ++i));
    } else if (a === "--allow-users") {
        allowUsers = parseAllowUsers(safeNextArg(process.argv, ++i));
    } else if (a === "--google-oauth-client-id") {
        googleOAuthClientId = safeNextArg(process.argv, ++i);
    } else if (a === "--session-expiration") {
        sessionExpirationDays = parseNumber(safeNextArg(process.argv, ++i));
    } else if (a === "--disable-speech-to-text") {
        enableSpeechToText = false;
    } else if (a === "--disable-realtime") {
        enableRealtime = false;
    } else if (a === "-v" || a === "--verbose") {
        logLevel++;
    } else if (a === "--random-errors") {
        randomErrors = true;
    } else {
        logFatal("Unexpected command line argument: %s", a);
    }
}
setLogLevel(logLevel);
if (process.env.VW_STATIC) {
    staticContent.push(...process.env.VW_STATIC.split(";").map(parseStatic));
}
setRandomErrorsEnabled(randomErrors);
pauseRandomErrors();

// Initialize configuration
const config: ChatServerConfig = {
    allowUsers: allowUsers,
    googleOAuthClientId: googleOAuthClientId,
    sessionExpiration: sessionExpirationDays * 24 * 60 * 60 * 1000,
};

function safeNextArg(argv: string[], i: number) {
    if (i < argv.length) {
        return argv[i];
    } else {
        return logFatal("Unexpected end of command line arguments");
    }
}

function parseStatic(arg: string): StaticContent {
    const ic = arg.indexOf(":");
    if (arg.startsWith("/") && ic > 0) {
        return { path: arg.substring(0, ic), dir: arg.substring(ic + 1) };
    } else {
        return { dir: arg };
    }
}

function parseAllowUsers(allowUsers?: string) {
    if (allowUsers !== undefined) {
        if (allowUsers.length > 0) {
            return allowUsers.split(/(\s*,\s*|\s+)/);
        } else {
            return [];
        }
    } else {
        return undefined;
    }
}

function parseTrustProxy(arg: string | undefined) {
    if (arg === undefined) {
        return false;
    } else if (arg === "true" || arg === "false") {
        return Boolean(arg);
    } else if (/^(0|[1-9][0-9]*)$/.exec(arg)) {
        return Number(arg);
    } else {
        return arg;
    }
}

const originMatchRE = /^\/(.*)\/$/;
function parseAllowOrigin(arg: string | undefined) {
    if (arg === undefined) {
        return undefined;
    } else {
        return arg.split(/(\s*,\s*|\s+)/).map((origin) => {
            const m = originMatchRE.exec(origin);
            if (m) return new RegExp(m[1]);
            else return origin;
        });
    }
}

function parseNumber(arg: string): number;
function parseNumber(arg: undefined): undefined;
function parseNumber(arg: string | undefined): number | undefined;
function parseNumber(arg: string | undefined): number | undefined {
    if (arg === undefined) return undefined;
    const n = Number(arg);
    if (isNaN(n)) {
        logFatal("Invalid number: %s", arg);
    }
    return n;
}

function parseBoolean(arg: string): boolean;
function parseBoolean(arg: undefined): undefined;
function parseBoolean(arg: string | undefined): boolean | undefined;
function parseBoolean(arg: string | undefined): boolean | undefined {
    if (arg === undefined) return undefined;
    if (arg === "true") {
        return true;
    } else if (arg === "false") {
        return false;
    } else {
        logFatal('Invalid boolean (expected "true" or "false"): %s', arg);
    }
}

// Switch to specified directory
if (chdir !== undefined) {
    logInfo("Changing directory to %s", undefined, chdir);
    process.chdir(chdir);
}

// Initialize server configuration
const envInitialInstruction = process.env.VW_INITIAL_INSTRUCTION;
const envPageContent = process.env.VW_PAGE_CONTENT;
const envChatModel = process.env.VW_CHAT_MODEL;
const serverOverrides: InitialChatStateOverrides = {
    ...(envInitialInstruction !== undefined ? { initialInstruction: envInitialInstruction } : {}),
    ...(envPageContent !== undefined ? { pageContent: envPageContent } : {}),
    ...(envChatModel !== undefined ? { model: envChatModel } : {}),
};

// Initialize AI engine
const engine: Engine = new OpenAIEngine();
const moderation = engine.moderationProvider();
const chatCompletion = engine.chatCompletionProvider();
const transcription = enableSpeechToText ? engine.transcriptionProvider() : undefined;
const realtime = enableRealtime ? engine.realtimeProvider() : undefined;

// Use WebSocket Express
const backend = new WebSocketExpress();

// Set trust proxy setting
backend.set("trust proxy", trustProxy);

// Produce random delays and errors, if so configured
backend.use((req, res, next) => {
    httprnderr(req, res, next);
});

// Parse cookies
backend.use(cookieParser());

// Initialize session
backend.use((req, res, next) => {
    initSession(req, res, next).catch((err: unknown) => {
        logThrownError("Session initialization failed", err, contextFrom(req));
    });
});

// Log all requests
backend.use((req, res, next) => {
    logRequest(req, next);
});

// Set CORS headers for all responses, except for the WebSocket endpoint
const corsHandler = cors({ origin: parseAllowOrigin(process.env.VW_ALLOW_ORIGIN) });
backend.use((req, res, next) => {
    if (req.path === CHAT_PATH && req.method === "GET") {
        next();
    } else {
        corsHandler(req, res, next);
    }
});

// Client configuration endpoint
backend.get("/vw/conf", (req, res) => {
    handleConfRequest(req, res);
});

// Client authentication endpoint
backend.get("/vw/auth/session", (req, res) => {
    handleAuthCheck(config, req, res).catch((err: unknown) => {
        logThrownError("Authentication check failed", err);
    });
});
backend.delete("/vw/auth/session", (req, res) => {
    endSession(req, res).catch((err: unknown) => {
        logThrownError("Logout failed", err);
    });
});
backend.post("/vw/auth/login/:idp", (req, res) => {
    handleAuthRequest(config, req, res).catch((err: unknown) => {
        logThrownError("Authentication request failed", err);
    });
});

// Client chat API web socket endpoint
backend.ws(CHAT_PATH, (req, res) => {
    res.accept()
        .then((ws) => {
            new ChatServer(req, ws, transcription, moderation, chatCompletion, realtime, config, serverOverrides);
        })
        .catch((err: unknown) => {
            logThrownError("Failed to accept web socket connection [%s]", err, undefined, req.ip);
        });
});

// Serve frontend assets
backend.use("/", express.static(path.resolve(__dirname, "assets")));

// Serve other static files, if so instructed
for (const sc of staticContent) {
    const path = sc.path ?? "/";
    logInfo("Serving static content from %s at path %s", undefined, sc.dir, path);
    backend.use(path, express.static(sc.dir));
}

// Initialize session
async function initSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    const path = req.path;
    if (path.startsWith(BASE_PATH)) {
        req.vwSession = await checkSession(req, path === CHAT_PATH ? undefined : res);
    }
    next();
}

function logRequest(req: Request, next: NextFunction): void {
    if (req.method && req.url) {
        const ctx = contextFrom(req);
        logInfo("%s %s", ctx, req.method, req.url);
    }
    next();
}

/** Handles a configuration request from the frontend */
function handleConfRequest(req: Request, res: Response) {
    const clientConf: SharedConfig = {
        ...(config.allowUsers !== undefined || config.googleOAuthClientId !== undefined
            ? {
                  auth: {
                      required: config.allowUsers !== undefined,
                      googleId: config.googleOAuthClientId,
                  },
              }
            : {}),
        ...(transcription
            ? { speechToText: { supportedAudioTypes: transcription.supportedTranscriptionAudioTypes() } }
            : {}),
        ...(realtime
            ? {
                  realtime: {
                      supportedInputAudioTypes: realtime.supportedRealtimeInputAudioTypes(),
                      supportedOutputAudioTypes: realtime.supportedRealtimeOutputAudioTypes(),
                  },
              }
            : {}),
    };
    res.json(clientConf);
}

// Start listening for requests
backend.listen(port, () => {
    logInfo("Started listening on port %d", undefined, port);
});
