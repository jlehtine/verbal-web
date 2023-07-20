export interface BackendRequest {
    query: string;
}

export interface BackendResponse {
    response: string;
}

export interface Message {
    role: "user" | "assistant";
    content: string;
}

export function isBackendRequest(value: unknown): value is BackendRequest {
    return typeof value === "object" && value !== null && typeof (value as BackendRequest).query === "string";
}

export function isBackendResponse(value: unknown): value is BackendResponse {
    return typeof value === "object" && value !== null && typeof (value as BackendResponse).response === "string";
}
