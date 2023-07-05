export interface ChatCompletionRequest {
    model: string;
    messages: ChatCompletionMessage[];
}

export interface ChatCompletionResponse {
    object: "chat.completion";
    choices: ChatCompletionChoice[];
}

export interface ChatCompletionMessage {
    role: "system" | "user" | "assistant" | "function";
    content?: string;
    name?: string;
}

export interface ChatCompletionChoice {
    index: number;
    message: ChatCompletionMessage;
    finish_reason: string;
}

export function isChatCompletionResponse(value: unknown): value is ChatCompletionResponse {
    return (
        typeof value === "object" && value !== null && (value as ChatCompletionResponse).object === "chat.completion"
    );
}
