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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-member-access
    return typeof value === "object" && value !== null && (value as any).object === "chat.completion";
}
