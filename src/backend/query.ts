import { ChatState } from "../shared/api";
import { logInterfaceData } from "./log";
import { checkModeration, checkModerations } from "./moderation";
import { OpenAI } from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4o";

export function query(breq: ChatState, openai: OpenAI): Promise<string> {
    const initialInstruction = breq.initialInstruction;
    const pageContent = breq.pageContent;
    const model = breq.model ?? DEFAULT_CHAT_MODEL;
    const systemInstruction = initialInstruction
        ? initialInstruction + (pageContent ? "\n\n" + pageContent : "")
        : undefined;

    // Check moderation for all content (also page content)
    const msgs: string[] = [...(systemInstruction ? [systemInstruction] : []), ...breq.messages.map((m) => m.content)];
    return checkModerations(msgs, openai).then(() => doQuery(systemInstruction, breq, model, openai));
}

function doQuery(
    systemInstruction: string | undefined,
    breq: ChatState,
    model: string,
    openai: OpenAI,
): Promise<string> {
    // Construct a chat completion request
    const chatCompletionMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemInstruction) {
        chatCompletionMessages.push({ role: "system", content: systemInstruction });
    }
    breq.messages.forEach((m) => {
        chatCompletionMessages.push({ role: m.role, content: m.content });
    });
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: model,
        messages: chatCompletionMessages,
    };

    // Process chat completion
    logInterfaceData("Sending chat completion request", params);
    return openai.chat.completions.create(params).then((chatCompletions) => {
        logInterfaceData("Received chat completion response", chatCompletions);
        const response = chatCompletions.choices[0].message.content ?? "";
        if (response) {
            return checkModeration(response, openai).then(() => response);
        } else {
            return response;
        }
    });
}
