import { BackendRequest, BackendResponse } from "../shared/api";
import { ChatCompletionMessage, ChatCompletionRequest, isChatCompletionResponse } from "./openai";

export function query(breq: BackendRequest): Promise<BackendResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("API key not configured");
    }

    const systemInstruction: ChatCompletionMessage = {
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
            Authorization: "Bearer " + apiKey,
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
                throw new Error(`Query failed with status ${resp.statusText}`);
            }
        })
        .then((data) => {
            if (isChatCompletionResponse(data)) {
                const bresp: BackendResponse = {
                    response: data.choices[0].message.content ?? "(No response)",
                };
                return bresp;
            } else {
                throw new Error("Unrecognized response");
            }
        });
}
