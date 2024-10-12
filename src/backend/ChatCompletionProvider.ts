import { RequestContext } from "./RequestContext";

/**
 * Generic chat completion request.
 */
export interface ChatCompletionRequest {
    /** Context details for the request */
    requestContext: RequestContext;

    /** Model identifier */
    model?: string;

    /** User identifier */
    user?: string;

    /** Message history */
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
     * @param request chat completion request
     * @return one or more updates asynchronously as API backend messages
     */
    chatCompletion(request: ChatCompletionRequest): Promise<AsyncIterable<string>>;
}
