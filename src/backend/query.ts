import { BackendRequest, BackendResponse } from "../shared/api";
import { ChatCompletionMessage, ChatCompletionRequest, isChatCompletionResponse } from "./openai";

export function query(breq: BackendRequest): Promise<BackendResponse> {
    const systemInstruction: ChatCompletionMessage = {
        role: "system",
        content:
            // initial instruction and page content can be overridden by environment variables VW_INITIAL_INSTRUCTION and VW_PAGE_CONTENT
            (process.env.VW_INITIAL_INSTRUCTION ?? breq.initialInstruction) +
            (process.env.VW_PAGE_CONTENT ?? breq.pageContent),
    };
    const chatCompletionMessages: ChatCompletionMessage[] = [systemInstruction];
    breq.query.forEach((m) => {
        chatCompletionMessages.push({ role: m.role, content: m.content });
    });

    const data: ChatCompletionRequest = {
        model: breq.model,
        messages: chatCompletionMessages,
    };

    return fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
            // Authorization: "Bearer " + 123, // test wrong API-key
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(data),
    })
        .then((resp) => {
            if (resp.ok) {
                return resp.json();
            } else {
                throw "Query failed";
            }
        })
        .then((data) => {
            if (isChatCompletionResponse(data)) {
                const bresp: BackendResponse = {
                    response: data.choices[0].message.content ?? "(No response)",
                };
                return bresp;
            } else {
                throw "Bad response";
            }
        });
}
