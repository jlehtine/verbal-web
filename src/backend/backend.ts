import { BackendResponse, isBackendRequest } from "../shared/api";
import { query } from "./query";
import { readFile } from "fs/promises";
import { ServerResponse, createServer } from "http";
import { ReasonPhrases, StatusCodes } from "http-status-codes";

const server = createServer({}, (req, resp) => {
    const allowOrigin = process.env.VW_ALLOW_ORIGIN ?? "*"; // "*" is default value
    // const allowOrigin = "https://google.com"; // for testing purposes

    try {
        console.log("URL=" + req.url);
        console.log("Method=" + req.method);
        console.log("Content-type=" + req.headers["content-type"]);
        if (req.url === "/verbal-web-frontend.js") {
            resp.setHeader("Access-Control-Allow-Origin", allowOrigin);
            resp.setHeader("Access-Control-Request-Method", "*");
            resp.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET");
            resp.setHeader("Access-Control-Allow-Headers", "*");
            if (req.method === "OPTIONS") {
                resp.end();
            } else if (req.method === "GET") {
                resp.statusCode = StatusCodes.OK;
                resp.setHeader("content-type", "text/javascript");
                readFile("verbal-web-frontend.js").then((data) => {
                    resp.setHeader("content-length", data.byteLength);
                    resp.write(data);
                    resp.end();
                });
            } else {
                resp.statusCode = StatusCodes.METHOD_NOT_ALLOWED;
                resp.end();
            }
        } else if (req.url === "/query") {
            resp.setHeader("Access-Control-Allow-Origin", allowOrigin);
            resp.setHeader("Access-Control-Request-Method", "*");
            resp.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
            resp.setHeader("Access-Control-Allow-Headers", "*");
            if (req.method === "OPTIONS") {
                resp.end();
            } else if (req.method === "POST" && req.headers["content-type"] === "application/json") {
                // Read and process data
                let data = "";
                req.on("data", (chunk) => {
                    data += chunk;
                });
                console.log(data);
                req.on("end", () => {
                    const breq = JSON.parse(data);
                    if (isBackendRequest(breq)) {
                        console.log(
                            "Received query: \nUse model: " +
                                breq.model +
                                "\nSystem instruction: " +
                                breq.initialInstruction +
                                breq.pageContent +
                                "\nMessages: " +
                                breq.query
                        );
                        query(breq)
                            .then((bresp) => {
                                console.log("Response is: " + bresp.response);
                                resp.statusCode = StatusCodes.OK;
                                resp.setHeader("content-type", "application/json");
                                resp.write(JSON.stringify(bresp));
                                resp.end();
                            })
                            .catch((err) => {
                                serverError(err, StatusCodes.INTERNAL_SERVER_ERROR, resp);
                            });
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
            serverError("Unknown request, URL" + req.url, StatusCodes.NOT_FOUND, resp);
        }
    } catch (err) {
        console.error("ERROR: " + err);
    }
});

// msg=error message, code=HTML status code
function serverError(msg: string, code: number, resp: ServerResponse) {
    console.error("ERROR: " + msg);
    resp.statusCode = code;
    resp.end();
}

server.listen(8080);
