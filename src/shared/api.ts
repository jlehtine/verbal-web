export interface BackendRequest {
    query: Message[];
    pageContent: string;
    initialInstruction: string;
    model: string;
}

export interface BackendResponse {
    response: string;
}

export interface Message {
    role: "user" | "assistant";
    content: string;
}

export function isBackendRequest(value: unknown): value is BackendRequest {
    return (
        typeof value === "object" &&
        value !== null &&
        Array.isArray((value as BackendRequest).query) &&
        typeof (value as BackendRequest).pageContent === "string" &&
        typeof (value as BackendRequest).initialInstruction === "string" &&
        typeof (value as BackendRequest).model === "string"
    );
}

export function isBackendResponse(value: unknown): value is BackendResponse {
    return typeof value === "object" && value !== null && typeof (value as BackendResponse).response === "string";
}
