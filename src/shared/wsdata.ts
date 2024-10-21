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
            amsg.binary = [binary];
        }
        if (typeCheck(amsg)) {
            return amsg;
        }
    }
    console.error("Invalid API message:", data);
    throw new VerbalWebError("Received WebSocket message is invalid", { cause });
}

/**
 * Parse WebSocket message data into JSON and binary parts.
 */
function toJsonBinaryParts(data: unknown): { json: string; binary?: Uint8Array } {
    // Handle string messages
    if (typeof data === "string") {
        return { json: data };
    }

    // Handle binary messages
    else if (data instanceof ArrayBuffer) {
        // Find nil-terminated JSON string and rest is binary data
        const view = new Uint8Array(data);
        let jsonLength = view.findIndex((v) => v === 0);
        if (jsonLength === -1) {
            jsonLength = view.length;
        }

        return {
            json: new TextDecoder().decode(view.subarray(0, jsonLength)),
            binary: jsonLength + 1 < view.length ? view.subarray(jsonLength + 1) : undefined,
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
    if (isUint8ArrayArray(binary)) {
        const json = JSON.stringify(msgRest);
        const jsonBytes = new TextEncoder().encode(json);
        const binaryBytes = binary.reduce((acc, b) => acc + b.byteLength, 0);
        const buffer = new Uint8Array(jsonBytes.length + 1 + binaryBytes);
        buffer.set(jsonBytes);
        buffer[jsonBytes.length] = 0;
        let offset = jsonBytes.length + 1;
        for (const b of binary) {
            buffer.set(b, offset);
            offset += b.byteLength;
        }
        return buffer.buffer;
    } else if (binary !== undefined) {
        console.error("Invalid API message binary data", binary);
        throw new VerbalWebError("API message binary data is not an Uint8Array[]");
    } else {
        return JSON.stringify(amsg);
    }
}

function isUint8ArrayArray(v: unknown): v is Uint8Array[] {
    return Array.isArray(v) && v.every((a) => a instanceof Uint8Array);
}
