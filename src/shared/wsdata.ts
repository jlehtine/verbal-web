import { ApiChatMessage } from "./api";
import { VerbalWebError } from "./error";
import { isObject } from "./util";

/**
 * Parse WebSocket data into an object.
 */
export function wsDataToApiMessage<T extends ApiChatMessage>(data: unknown, typeCheck: (v: unknown) => v is T): T {
    const { json, binary } = toJsonBinaryParts(data);
    let amsg: unknown;
    let cause;
    try {
        amsg = JSON.parse(json);
    } catch (err: unknown) {
        cause = err;
    }
    if (isObject(amsg)) {
        if (binary !== undefined) {
            amsg.binary = binary;
        }
        if (typeCheck(amsg)) {
            return amsg;
        }
    }
    throw new VerbalWebError("Received WebSocket message is invalid", { cause });
}

/**
 * Parse WebSocket message data into JSON and binary parts.
 */
function toJsonBinaryParts(data: unknown): { json: string; binary?: ArrayBuffer } {
    // Handle string messages
    if (typeof data === "string") {
        return { json: data };
    }

    // Handle binary messages
    else if (typeof data === "object" && data instanceof ArrayBuffer) {
        // Find nil-terminated JSON string and rest is binary data
        const view = new Uint8Array(data);
        let jsonLength = 0;
        while (jsonLength < view.length && view[jsonLength] !== 0) {
            jsonLength++;
        }

        return {
            json: new TextDecoder().decode(view.slice(0, jsonLength)),
            binary: jsonLength < view.length ? view.slice(jsonLength + 1).buffer : undefined,
        };
    }

    // Unexpected data type
    else {
        throw new VerbalWebError("WebSocket message data is not a string or an ArrayBuffer");
    }
}

/**
 * Encode API message into WebSocket data.
 */
export function apiMessageToWsData(amsg: ApiChatMessage): string | ArrayBuffer {
    const { binary, ...msgRest } = amsg;
    if (typeof binary === "object" && binary instanceof ArrayBuffer) {
        const json = JSON.stringify(msgRest);
        const jsonBytes = new TextEncoder().encode(json);
        const buffer = new ArrayBuffer(jsonBytes.length + 1 + binary.byteLength);
        const view = new Uint8Array(buffer);
        view.set(jsonBytes);
        view[json.length] = 0;
        view.set(new Uint8Array(binary), json.length + 1);
        return buffer;
    } else {
        return JSON.stringify(amsg);
    }
}
