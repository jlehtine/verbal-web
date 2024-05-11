import { BackendRequest, BackendResponse } from "../shared/api";
import { logDebug } from "./log";
import { checkModeration, checkModerations } from "./moderation";
import { OpenAI } from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4";

export function query(breq: BackendRequest, openai: OpenAI): Promise<BackendResponse> {
    const initialInstruction = process.env.VW_INITIAL_INSTRUCTION ?? breq.initialInstruction;
    const pageContent = process.env.VW_PAGE_CONTENT ?? breq.pageContent;
    const model = process.env.VW_CHAT_MODEL ?? breq.model ?? DEFAULT_CHAT_MODEL;
    const systemInstruction = initialInstruction
        ? initialInstruction + (pageContent ? "\n\n" + pageContent : "")
        : undefined;

    // Check moderation for all content (also page content)
    const msgs: string[] = [...(systemInstruction ? [systemInstruction] : []), ...breq.query.map((m) => m.content)];
    return checkModerations(msgs, openai).then(() => doQuery(systemInstruction, breq, model, openai));
}

function doQuery(
    systemInstruction: string | undefined,
    breq: BackendRequest,
    model: string,
    openai: OpenAI,
): Promise<BackendResponse> {
    // Construct a chat completion request
    const chatCompletionMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemInstruction) {
        chatCompletionMessages.push({ role: "system", content: systemInstruction });
    }
    breq.query.forEach((m) => {
        chatCompletionMessages.push({ role: m.role, content: m.content });
    });
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: model,
        messages: chatCompletionMessages,
    };

    // Process chat completion
    logDebug("Sending chat completion request", params);
    return openai.chat.completions.create(params).then((chatCompletions) => {
        logDebug("Received chat completion response", chatCompletions);
        const response = chatCompletions.choices[0].message.content;
        const bresp = { response: response ?? "(No response)" };
        if (response) {
            return checkModeration(response, openai).then(() => bresp);
        } else {
            return bresp;
        }
    });
}
