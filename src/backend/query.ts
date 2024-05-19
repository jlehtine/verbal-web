import { ChatInit, ChatMessage } from "../shared/api";
import { logInterfaceData } from "./log";
import { checkModeration, checkModerations } from "./moderation";
import { OpenAI } from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4";

export function query(breq: ChatInit, openai: OpenAI): Promise<ChatMessage> {
    const initialInstruction = process.env.VW_INITIAL_INSTRUCTION ?? breq.initialInstruction;
    const pageContent = process.env.VW_PAGE_CONTENT ?? breq.pageContent;
    const model = process.env.VW_CHAT_MODEL ?? breq.model ?? DEFAULT_CHAT_MODEL;
    const systemInstruction = initialInstruction
        ? initialInstruction + (pageContent ? "\n\n" + pageContent : "")
        : undefined;

    // Check moderation for all content (also page content)
    const msgs: string[] = [...(systemInstruction ? [systemInstruction] : []), ...breq.messages.map((m) => m.content)];
    return checkModerations(msgs, openai).then(() => doQuery(systemInstruction, breq, model, openai));
}

function doQuery(
    systemInstruction: string | undefined,
    breq: ChatInit,
    model: string,
    openai: OpenAI,
): Promise<ChatMessage> {
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
        const response = chatCompletions.choices[0].message.content;
        const bresp: ChatMessage = { role: "assistant", content: response ?? "(No response)" };
        if (response) {
            return checkModeration(response, openai).then(() => bresp);
        } else {
            return bresp;
        }
    });
}
