import { isBackendRequest } from "../shared/api";
import { describeError } from "../shared/error";
import { logDebug, logError, logFatal, logInfo, setLogLevel } from "./log";
import { query } from "./query";
import bodyParser from "body-parser";
import cors from "cors";
import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { OpenAI } from "openai";
import path from "path";

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
  -v, --verbose
        increase logging, use multiple times for even more verbose logging
`);
}

// Read arguments
let port = process.env.VW_PORT ? parseInt(process.env.VW_PORT) : DEFAULT_PORT;
let chdir = process.env.VW_CHDIR;
const staticContent: StaticContent[] = [];
let logLevel = process.env.VW_LOG_LEVEL ? parseInt(process.env.VW_LOG_LEVEL) : 0;
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
    } else if (a === "-v" || a === "--verbose") {
        logLevel++;
    } else {
        logFatal("Unexpected command line argument: %s", a);
    }
}
setLogLevel(logLevel);
if (process.env.VW_STATIC) {
    staticContent.push(...process.env.VW_STATIC.split(";").map(parseStatic));
}

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

// Switch to specified directory
if (chdir !== undefined) {
    logInfo("Changing directory to %s", chdir);
    process.chdir(chdir);
}

// Initialize OpenAI API
logInfo("Initializing OpenAI API");
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    logFatal("API key not configured in environment variable OPENAI_API_KEY");
}
const openai = new OpenAI({
    apiKey: apiKey,
});

// Use Express.js
const backend = express();

// Log all requests
backend.use((req, res, next) => {
    logRequest(req);
    next();
});

// Set CORS headers for all responses
backend.use(cors({ origin: process.env.VW_ALLOW_ORIGIN }));

// Answer queries
backend.post("/query", bodyParser.json(), (req, res) => {
    const breq: unknown = req.body;
    logDebug("Received frontend request", breq);
    if (isBackendRequest(breq)) {
        query(breq, openai)
            .then((bresp) => {
                logDebug("Returning frontend response", bresp);
                res.json(bresp);
            })
            .catch(catchUnexpectedFunc(res));
    } else {
        res.sendStatus(StatusCodes.BAD_REQUEST);
    }
});

// Serve frontend assets
backend.use("/", express.static(path.resolve(__dirname, "assets")));

// Serve other static files, if so instructed
for (const sc of staticContent) {
    const path = sc.path ?? "/";
    logInfo("Serving static content from %s at path %s", sc.dir, path);
    backend.use(path, express.static(sc.dir));
}

function catchUnexpectedFunc(resp: Response) {
    return (err: unknown) => {
        logError(describeError(err, true, "ERROR"));
        resp.sendStatus(StatusCodes.INTERNAL_SERVER_ERROR);
    };
}

function logRequest(req: Request) {
    if (req.method && req.url) {
        logInfo("Processing request [%s]: %s %s", req.ip, req.method, req.url);
    }
}

// Start listening for requests
backend.listen(port, () => {
    logInfo("Started listening on port %d", port);
});
