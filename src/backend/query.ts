import { BackendRequest, BackendResponse } from "../shared/api";
import { checkModeration, checkModerations } from "./moderation";
import { OpenAI } from "openai";

export function query(breq: BackendRequest, openai: OpenAI): Promise<BackendResponse> {
    return checkModerations(
        breq.query.map((m) => m.content),
        openai,
    ).then(() => doQuery(breq, openai));
}

function doQuery(breq: BackendRequest, openai: OpenAI): Promise<BackendResponse> {
    if (process.env.VW_INITIAL_INSTRUCTION !== undefined) {
        console.log(
            "Initial instruction overridden by env variable VW_INITIAL_INSTRUCTION:\n" +
                process.env.VW_INITIAL_INSTRUCTION,
        );
    }
    if (process.env.VW_PAGE_CONTENT !== undefined) {
        console.log("Page content overridden by env variable VW_PAGE_CONTENT:\n" + process.env.VW_PAGE_CONTENT);
    }
    const initialInstruction = process.env.VW_INITIAL_INSTRUCTION ?? breq.initialInstruction;
    const pageContent = process.env.VW_PAGE_CONTENT ?? breq.pageContent;
    const systemInstruction: OpenAI.Chat.ChatCompletionMessageParam | undefined = initialInstruction
        ? {
              role: "system",
              content:
                  // initial instruction and page content can be overridden by environment variables VW_INITIAL_INSTRUCTION and VW_PAGE_CONTENT
                  initialInstruction + (pageContent ? "\n\n" + pageContent : ""),
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
        model: breq.model,
        messages: chatCompletionMessages,
    };

    return openai.chat.completions.create(params).then((chatCompletions) => {
        const response = chatCompletions.choices[0].message.content;
        const bresp = { response: response ?? "(No response)" };
        if (response) {
            return checkModeration(response, openai).then(() => bresp);
        } else {
            return bresp;
        }
    });
}
