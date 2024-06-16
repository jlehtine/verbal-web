import { VerbalWebError } from "../shared/error";
import { retryWithBackoff } from "../shared/retry";
import { ChatCompletionProvider, ChatCompletionRequest } from "./ChatCompletionProvider";
import { ModerationProvider, ModerationResult } from "./ModerationProvider";
import { RequestContext } from "./RequestContext";
import { logFatal, logInfo, logInterfaceData, logThrownError } from "./log";
import { asyncrnderr, isrnderr, withrnderr } from "./randomErrors";
import OpenAI from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4o";

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
                const request: OpenAI.ModerationCreateParams = { input: c };
                logInterfaceData("Sending moderation request", requestContext, request);
                return retryWithBackoff(
                    () =>
                        withrnderr("wmod", this.openai.moderations.create(request)).then(
                            asyncrnderr("amod", (response) => {
                                logInterfaceData("Received moderation response", requestContext, response);
                                if (response.results.length !== 1) {
                                    throw new VerbalWebError("Expected a single moderation result");
                                }
                                const r = response.results[0];
                                if (isrnderr("ismod")) return { content: c, flagged: true, reason: "random" };
                                return {
                                    content: c,
                                    flagged: r.flagged,
                                    ...(r.flagged
                                        ? {
                                              reason: Object.entries(r.categories)
                                                  .filter((e) => e[1] === true)
                                                  .map((e) => e[0])
                                                  .join(", "),
                                          }
                                        : {}),
                                };
                            }),
                        ),
                    (err) => {
                        logThrownError("Moderation failed, retrying...", err, requestContext);
                    },
                    BACKOFF_MAX_ATTEMPTS,
                );
            }),
        );
    }

    chatCompletion(request: ChatCompletionRequest): Promise<AsyncIterable<string>> {
        const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
            model: request.model ?? DEFAULT_CHAT_MODEL,
            user: request.user,
            messages: request.messages,
            stream: true,
        };
        logInterfaceData("Sending chat completion request", request.requestContext, params);
        return retryWithBackoff(
            () =>
                withrnderr("wchat", this.openai.chat.completions.create(params)).then(
                    asyncrnderr("achat", (stream) => {
                        const strIterable: AsyncIterable<string> = {
                            [Symbol.asyncIterator]: () => {
                                const iter = stream[Symbol.asyncIterator]();
                                const strIter: AsyncIterator<string> = {
                                    next: () => {
                                        return withrnderr("wchunk", iter.next()).then(
                                            asyncrnderr(
                                                "achunk",
                                                ({ done, value }) => {
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
                                                },
                                                0.1,
                                            ),
                                        );
                                    },
                                };
                                return strIter;
                            },
                        };
                        return strIterable;
                    }),
                ),
            (err) => {
                logThrownError("Chat completion failed, retrying...", err, request.requestContext);
            },
            BACKOFF_MAX_ATTEMPTS,
        );
    }
}
