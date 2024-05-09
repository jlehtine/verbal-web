import { isBackendRequest } from "../shared/api";
import { describeError } from "../shared/error";
import { HttpMethod } from "./httpmethods";
import { logInterfaceData } from "./log";
import { query } from "./query";
import { readFile } from "fs/promises";
import { IncomingMessage, ServerResponse, createServer } from "http";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { OpenAI } from "openai";
import path from "path";

// Initialize OpenAI API
console.log("Initializing OpenAI API");
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    throw new Error("API key not configured");
}
const openai = new OpenAI({
    apiKey: apiKey,
});

const server = createServer({}, (req, resp) => {
    const allowOrigin = process.env.VW_ALLOW_ORIGIN ?? "*"; // "*" is default value
    // const allowOrigin = "https://google.com"; // for testing purposes

    try {
        logRequest(req);
        if (req.url === "/verbal-web-frontend.js") {
            setCorsHeaders(resp, allowOrigin, ["GET"]);
            if (req.method === "OPTIONS") {
                resp.end();
            } else if (req.method === "GET") {
                resp.statusCode = StatusCodes.OK;
                resp.setHeader("content-type", "text/javascript");
                readFile("verbal-web-frontend.js")
                    .then((data) => {
                        resp.setHeader("content-length", data.byteLength);
                        resp.write(data);
                        resp.end();
                    })
                    .catch(catchUnexpectedFunc(resp));
            } else {
                resp.statusCode = StatusCodes.METHOD_NOT_ALLOWED;
                resp.end();
            }
        } else if (req.url?.match(/^\/test\/\w+\.html$/)) {
            const file = path.join(...req.url.split("/").slice(1));
            setCorsHeaders(resp, allowOrigin, ["GET"]);
            if (req.method === "OPTIONS") {
                resp.end();
            } else if (req.method === "GET") {
                resp.statusCode = StatusCodes.OK;
                resp.setHeader("content-type", "text/html");
                readFile(file)
                    .then((data) => {
                        resp.setHeader("content-length", data.byteLength);
                        resp.write(data);
                        resp.end();
                    })
                    .catch(catchUnexpectedFunc(resp));
            } else {
                resp.statusCode = StatusCodes.METHOD_NOT_ALLOWED;
                resp.end();
            }
        } else if (req.url === "/query") {
            setCorsHeaders(resp, allowOrigin, ["POST"]);
            if (req.method === "OPTIONS") {
                resp.end();
            } else if (req.method === "POST" && req.headers["content-type"] === "application/json") {
                req.setEncoding("utf8");
                // Read and process data
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
                                resp.statusCode = StatusCodes.OK;
                                resp.setHeader("content-type", "application/json");
                                resp.write(JSON.stringify(bresp));
                                resp.end();
                            })
                            .catch(catchUnexpectedFunc(resp));
                    } else {
                        resp.statusCode = StatusCodes.BAD_REQUEST;
                        resp.setHeader("content-type", "text/plain");
                        resp.write(ReasonPhrases.BAD_REQUEST);
                        resp.end();
                    }
                });
            } else {
                resp.statusCode = StatusCodes.METHOD_NOT_ALLOWED;
                resp.end();
            }
        } else {
            serverError("Not found: " + (req.url ?? ""), StatusCodes.NOT_FOUND, resp);
        }
    } catch (err) {
        catchUnexpectedFunc(resp)(err);
    }
});

function setCorsHeaders(resp: ServerResponse, allowOrigin: string, methods: HttpMethod[]) {
    resp.setHeader("Access-Control-Allow-Origin", allowOrigin);
    resp.setHeader("Access-Control-Allow-Methods", methods.join(", "));
    resp.setHeader("Access-Control-Allow-Headers", "*");
}

// msg=error message, code=HTML status code
function serverError(msg: string, code: number, resp: ServerResponse) {
    console.error("ERROR: " + msg);
    resp.statusCode = code;
    resp.end();
}

function catchUnexpectedFunc(resp: ServerResponse) {
    return (err: unknown) => {
        console.error(describeError(err, true, "ERROR"));
        resp.statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
        resp.end();
    };
}

function logRequest(req: IncomingMessage) {
    if (req.method && req.url) {
        console.log(`Processing request: ${req.method} ${req.url}`);
    }
}

console.log("Start listening for requests");
server.listen(8080);
