/**
 * Generic chat completion request.
 */
export interface ChatCompletionRequest {
    model?: string;
    messages: ChatCompletionMessage[];
}

/**
 * Generic chat completion message.
 */
export interface ChatCompletionMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/**
 * Generic interface for a chat completion provider.
 */
export interface ChatCompletionProvider {
    /**
     * Perform chat completion. Returns asynchronously iterable list of updates.
     *
     * @param request initial chat state
     * @return one or more updates asynchronously as API backend messages
     */
    chatCompletion(request: ChatCompletionRequest): Promise<AsyncIterable<string>>;
}
