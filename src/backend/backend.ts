import { isBackendRequest } from "../shared/api";
import { describeError } from "../shared/error";
import { logInterfaceData } from "./log";
import { query } from "./query";
import cors from "cors";
import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { OpenAI } from "openai";
import path from "path";

const FRONTEND_JS = "verbal-web-frontend.js";

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

// Serve static test files, if available
backend.use("/test", express.static("test"));

// Serve frontend Javascript
backend.get("/" + FRONTEND_JS, (req, res) => {
    res.sendFile(path.resolve(FRONTEND_JS));
});

// Answer queries
backend.post("/query", (req, res) => {
    if (!hasJsonContent(req)) {
        res.sendStatus(StatusCodes.BAD_REQUEST);
        return;
    }
    req.setEncoding("utf8");
    let data = "";
    req.on("data", (chunk) => {
        if (typeof chunk === "string") {
            data += chunk;
        } else {
            throw new Error(`Received a chunk of unexpected type ${typeof chunk}`);
        }
    });
    console.log(data);
    req.on("end", () => {
        const breq: unknown = JSON.parse(data);
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
});

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

function hasJsonContent(req: Request): boolean {
    const contentType = req.headers["content-type"];
    return contentType ? contentType.split(";")[0].trim().toLowerCase() === "application/json" : false;
}

// Start listening for requests
const port = process.env.VW_HTTP_PORT ? parseInt(process.env.VW_HTTP_PORT) : 8080;
backend.listen(port, () => {
    console.log(`Started listening on port ${port.toString()}`);
});
