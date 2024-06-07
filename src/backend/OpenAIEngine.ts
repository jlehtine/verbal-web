import { retryWithBackoff } from "../shared/retry";
import { ChatCompletionProvider, ChatCompletionRequest } from "./ChatCompletionProvider";
import { ModerationProvider, ModerationResult } from "./ModerationProvider";
import { RequestContext } from "./RequestContext";
import { logFatal, logInfo, logInterfaceData, logThrownError } from "./log";
import OpenAI from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4o";

/** Retry backoff base milliseconds */
const BACKOFF_BASE_MILLIS = 8;

/** Max backoff attempts */
const BACKOFF_MAX_ATTEMPTS = 5;

/**
 * AI engine based on Open AI services.
 */
export class OpenAIEngine implements ChatCompletionProvider, ModerationProvider {
    readonly textChunkerParams = {
        maxChunkSize: 2000,
        minChunkSize: 500,
        maxChunkOverlap: 200,
        minChunkOverlap: 100,
    };

    private readonly openai;

    constructor() {
        logInfo("Initializing OpenAI API");
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            logFatal("API key not configured in environment variable OPENAI_API_KEY");
        }
        this.openai = new OpenAI({
            apiKey: apiKey,
        });
    }

    moderation(requestContext: RequestContext, ...content: string[]): Promise<ModerationResult[]> {
        return Promise.all(
            content.map((c) => {
                const request: OpenAI.ModerationCreateParams = { input: content };
                logInterfaceData("Sending moderation request", requestContext, request);
                return retryWithBackoff(
                    () =>
                        this.openai.moderations.create(request).then((response) => {
                            logInterfaceData("Received moderation response", requestContext, response);
                            const flagged = response.results
                                .map((r) => r.flagged)
                                .reduce((accumulator, currentValue) => accumulator || currentValue, false);
                            return { content: c, flagged: flagged };
                        }),
                    (err) => {
                        logThrownError("Moderation failed, retrying...", err, requestContext);
                    },
                    BACKOFF_BASE_MILLIS,
                    BACKOFF_MAX_ATTEMPTS,
                );
            }),
        );
    }

    chatCompletion(request: ChatCompletionRequest): Promise<AsyncIterable<string>> {
        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            model: request.model ?? DEFAULT_CHAT_MODEL,
            messages: request.messages,
            stream: true,
        };
        logInterfaceData("Sending chat completion request", request.requestContext, params);
        return retryWithBackoff(
            () =>
                this.openai.chat.completions.create(params).then((stream) => {
                    const strIterable: AsyncIterable<string> = {
                        [Symbol.asyncIterator]: () => {
                            const iter = stream[Symbol.asyncIterator]();
                            const strIter: AsyncIterator<string> = {
                                next: () => {
                                    return iter.next().then(({ done, value }) => {
                                        if (done) {
                                            return { done: true, value: undefined };
                                        } else {
                                            logInterfaceData(
                                                "Received a chat completion chunk",
                                                request.requestContext,
                                                value,
                                            );
                                            return { value: value.choices[0]?.delta?.content ?? "" };
                                        }
                                    });
                                },
                            };
                            return strIter;
                        },
                    };
                    return strIterable;
                }),
            (err) => {
                logThrownError("Chat completion failed, retrying...", err, request.requestContext);
            },
            BACKOFF_BASE_MILLIS,
            BACKOFF_MAX_ATTEMPTS,
        );
    }
}
