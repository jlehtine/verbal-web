import { BackendRequest, BackendResponse } from "../shared/api";
import { logInterfaceData } from "./log";
import { checkModeration, checkModerations } from "./moderation";
import { OpenAI } from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4";

export function query(breq: BackendRequest, openai: OpenAI): Promise<BackendResponse> {
    return checkModerations(
        breq.query.map((m) => m.content),
        openai,
    ).then(() => doQuery(breq, openai));
}

function doQuery(breq: BackendRequest, openai: OpenAI): Promise<BackendResponse> {
    const initialInstruction = process.env.VW_INITIAL_INSTRUCTION ?? breq.initialInstruction;
    const pageContent = process.env.VW_PAGE_CONTENT ?? breq.pageContent;
    const model = process.env.VW_CHAT_MODEL ?? breq.model ?? DEFAULT_CHAT_MODEL;
    const systemInstruction: OpenAI.Chat.ChatCompletionMessageParam | undefined = initialInstruction
        ? {
              role: "system",
              content: initialInstruction + (pageContent ? "\n\n" + pageContent : ""),
          }
        : undefined;
    const chatCompletionMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemInstruction) {
        chatCompletionMessages.push(systemInstruction);
    }
    breq.query.forEach((m) => {
        chatCompletionMessages.push({ role: m.role, content: m.content });
    });

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: model,
        messages: chatCompletionMessages,
    };

    logInterfaceData("Sending chat completion request", params);
    return openai.chat.completions.create(params).then((chatCompletions) => {
        logInterfaceData("Received chat completion response", chatCompletions);
        const response = chatCompletions.choices[0].message.content;
        const bresp = { response: response ?? "(No response)" };
        if (response) {
            return checkModeration(response, openai).then(() => bresp);
        } else {
            return bresp;
        }
    });
}
