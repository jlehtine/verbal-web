import { SharedConfig } from "../shared/api";
import { InitialChatStateOverrides } from "../shared/chat";
import { ChatCompletionProvider } from "./ChatCompletionProvider";
import { ChatServer, ChatServerConfig } from "./ChatServer";
import { ModerationProvider } from "./ModerationProvider";
import { OpenAIEngine } from "./OpenAIEngine";
import { contextFrom } from "./RequestContext";
import { handleAuthCheck, handleAuthRequest } from "./auth";
import { logFatal, logInfo, logThrownError, setLogLevel } from "./log";
import { pauseRandomErrors, setRandomErrorsEnabled } from "./randomErrors";
import { checkSession } from "./session";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import { WebSocketExpress } from "websocket-express";

interface StaticContent {
    path?: string;
    dir: string;
}

const DEFAULT_PORT = 3000;

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
    } else if (arg.match(/^(0|[1-9][0-9]*)$/)) {
        return Number(arg);
    } else {
        return arg;
    }
}

function parseNumber(arg: string): number;
function parseNumber(arg: undefined): undefined;
function parseNumber(arg: string | undefined): number | undefined;
function parseNumber(arg: string | undefined): number | undefined {
    if (arg === undefined) return undefined;
    return Number(arg);
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
const engine = new OpenAIEngine();
const moderation: ModerationProvider = engine;
const chatCompletion: ChatCompletionProvider = engine;

// Use WebSocket Express
const backend = new WebSocketExpress();

// Set trust proxy setting
backend.set("trust proxy", trustProxy);

// Parse cookies
backend.use(cookieParser());

// Log all requests
backend.use((req, res, next) => {
    logRequest(req, next).catch((err: unknown) => {
        logThrownError("Request logging failed", err, contextFrom(req));
    });
});

// Set CORS headers for all responses
backend.use(cors({ origin: process.env.VW_ALLOW_ORIGIN }));

// Client configuration endpoint
backend.get("/vw/conf", (req, res) => {
    handleConfRequest(req, res);
});

// Client authentication endpoint
backend.get("/vw/auth", (req, res) => {
    handleAuthCheck(config, req, res).catch((err: unknown) => {
        logThrownError("Authentication check failed", err);
    });
});
backend.post("/vw/auth/:idp", (req, res) => {
    handleAuthRequest(config, req, res).catch((err: unknown) => {
        logThrownError("Authentication request failed", err);
    });
});

// Client chat API web socket endpoint
backend.ws("/vw/chat", (req, res) => {
    res.accept()
        .then((ws) => {
            new ChatServer(req, ws, moderation, chatCompletion, config, serverOverrides);
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

async function logRequest(req: Request, next: NextFunction): Promise<void> {
    if (req.method && req.url) {
        const session = await checkSession(req);
        const ctx = contextFrom(req, session);
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
    };
    res.json(clientConf);
}

// Start listening for requests
backend.listen(port, () => {
    logInfo("Started listening on port %d", undefined, port);
});
