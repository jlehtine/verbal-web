import { BackendRequest, BackendResponse } from "../shared/api";
import { OpenAI } from "openai";

export function query(breq: BackendRequest, openai: OpenAI): Promise<BackendResponse> {
    const systemInstruction: OpenAI.Chat.ChatCompletionMessageParam = {
        role: "system",
        content:
            // initial instruction and page content can be overridden by environment variables VW_INITIAL_INSTRUCTION and VW_PAGE_CONTENT
            (process.env.VW_INITIAL_INSTRUCTION ?? breq.initialInstruction) +
            (process.env.VW_PAGE_CONTENT ?? breq.pageContent),
    };
    if (process.env.VW_INITIAL_INSTRUCTION !== undefined) {
        console.log(
            "Initial instruction overridden by env variable VW_INITIAL_INSTRUCTION:\n" +
                process.env.VW_INITIAL_INSTRUCTION +
                "\n",
        );
    }
    if (process.env.VW_PAGE_CONTENT !== undefined) {
        console.log("Page content overridden by env variable VW_PAGE_CONTENT:\n" + process.env.VW_PAGE_CONTENT + "\n");
    }
    const chatCompletionMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [systemInstruction];
    breq.query.forEach((m) => {
        chatCompletionMessages.push({ role: m.role, content: m.content });
    });

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: breq.model,
        messages: chatCompletionMessages,
    };

    return openai.chat.completions.create(params).then((chatCompletions) => {
        return {
            response: chatCompletions.choices[0].message.content ?? "(No response)",
        };
    });
}
