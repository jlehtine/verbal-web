import { isBackendRequest } from "../shared/api";
import { describeError } from "../shared/error";
import { logInterfaceData } from "./log";
import { query } from "./query";
import bodyParser from "body-parser";
import cors from "cors";
import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { OpenAI } from "openai";
import path from "path";

const FRONTEND_JS = "verbal-web-frontend.js";

interface StaticContent {
    path?: string;
    dir: string;
}

// Usage
function usage() {
    const basename = process.argv[1].replace(/^.*[/\\]/, "");
    console.log(`usage: node ${basename} [option]...

options:
  -h, --help    print this help text
  -p, --port PORT
                listen to the specified port (default is 8080)
  --chdir DIR   switch to DIR on startup
  --static [/PATH:]DIR
                serve static content from DIR either as /PATH or at root,
                repeat the option to serve content from multiple directories
`);
}

// Read arguments
let port = process.env.VW_PORT ? parseInt(process.env.VW_PORT) : 8080;
let chdir = process.env.VW_CHDIR;
const staticContent: StaticContent[] = [];
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "-h" || a === "--help") {
        usage();
        process.exit(0);
    } else if (a === "--chdir") {
        chdir = safeNextArg(process.argv, ++i);
    } else if (a === "--static") {
        staticContent.push(parseStatic(safeNextArg(process.argv, ++i)));
    } else {
        console.error(`Unexpected command line argument: ${a}`);
        process.exit(1);
    }
}
if (process.env.VW_STATIC) {
    staticContent.push(...process.env.VW_STATIC.split(";").map(parseStatic));
}

function safeNextArg(argv: string[], i: number) {
    if (i < argv.length) {
        return argv[i];
    } else {
        console.error("Unexpected end of command line arguments");
        process.exit(1);
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
    console.log(`Changing directory to ${chdir}`);
    process.chdir(chdir);
}

// Initialize OpenAI API
console.log("Initializing OpenAI API");
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    throw new Error("API key not configured");
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

// Serve frontend Javascript
backend.get("/" + FRONTEND_JS, (req, res) => {
    res.sendFile(path.resolve(FRONTEND_JS));
});

// Answer queries
backend.post("/query", bodyParser.json(), (req, res) => {
    const breq: unknown = req.body;
    logInterfaceData("Received frontend request", breq);
    if (isBackendRequest(breq)) {
        query(breq, openai)
            .then((bresp) => {
                logInterfaceData("Returning frontend response", bresp);
                res.json(bresp);
            })
            .catch(catchUnexpectedFunc(res));
    } else {
        res.sendStatus(StatusCodes.BAD_REQUEST);
    }
});

// Serve static files, if so instructed
for (const sc of staticContent) {
    const path = sc.path ?? "/";
    console.log(`Serving static content from ${sc.dir} at path ${path}`);
    backend.use(path, express.static(sc.dir));
}

function catchUnexpectedFunc(resp: Response) {
    return (err: unknown) => {
        console.error(describeError(err, true, "ERROR"));
        resp.sendStatus(StatusCodes.INTERNAL_SERVER_ERROR);
    };
}

function logRequest(req: Request) {
    if (req.method && req.url) {
        console.log(`Processing request: ${req.method} ${req.url}`);
    }
}

// Start listening for requests
backend.listen(port, () => {
    console.log(`Started listening on port ${port.toString()}`);
});
