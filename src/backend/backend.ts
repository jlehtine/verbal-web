import { BackendResponse, isBackendRequest } from "../shared/api";
import { query } from "./query";
import { readFile } from "fs/promises";
import { createServer } from "http";
import { ReasonPhrases, StatusCodes } from "http-status-codes";

const server = createServer({}, (req, resp) => {
    try {
        console.log("URL=" + req.url);
        console.log("Method=" + req.method);
        console.log("Content-type=" + req.headers["content-type"]);
        if (req.url === "/verbal-web-frontend.js") {
            resp.setHeader("Access-Control-Allow-Origin", "*");
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
            resp.setHeader("Access-Control-Allow-Origin", "*");
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
                            "Received query: \nSystem instruction: " +
                                breq.initialInstruction +
                                breq.pageContent +
                                "\nMessages: " +
                                breq.query
                        );
                        query(breq).then((bresp) => {
                            console.log("Response is: " + bresp.response);
                            resp.statusCode = StatusCodes.OK;
                            resp.setHeader("content-type", "application/json");
                            resp.write(JSON.stringify(bresp));
                            resp.end();
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
            throw "Unknown request";
        }
    } catch (err) {
        console.error("Error occurred: " + err);
    }
});

server.listen(8080);
