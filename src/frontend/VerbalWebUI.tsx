import { BackendRequest, Message, isBackendResponse } from "../shared/api";
import VerbalWebDialog from "./VerbalWebDialog";
import AssistantIcon from "@mui/icons-material/Assistant";
import { Box, IconButton, Tooltip } from "@mui/material";
import React, { useState } from "react";

export interface VerbalWebConfiguration {
    backendURL: string;
    pageContentSelector?: string;
    initialInstruction?: string;
    useModel?: string; // TODO: list of models?
}

interface VerbalWebUIProps {
    conf: VerbalWebConfiguration;
}

export default function VerbalWebUI({ conf }: VerbalWebUIProps) {
    // TODO: Change default values to better ones AND UPDATE README!!!
    const defaultInitialInstruction =
        "Answer the user questions and requests based on the following HTML information:\n\n";
    const defaultPageContentSelector = "h1, h2, p";
    const defaultModel = "gpt-4";

    // Set default value if no value given as conf option
    const initialInstruction = conf.initialInstruction ?? defaultInitialInstruction;
    const pageContentSelector = conf.pageContentSelector ?? defaultPageContentSelector;
    const useModel = conf.useModel ?? defaultModel;

    const [open, setOpen] = useState(false);

    function handleQuery(query: Message[]): Promise<string> {
        // Read page content
        // TODO: only read text, not all html
        const nodeList = document.querySelectorAll(pageContentSelector);
        // Page content to be added to the query
        let pageContent = "";
        nodeList.forEach((node) => {
            pageContent = pageContent + node.outerHTML;
        });
        console.log("pageContentSelector: " + pageContentSelector);
        console.log("pageContent: " + pageContent);

        const data: BackendRequest = {
            query: query,
            pageContent: pageContent,
            initialInstruction: initialInstruction,
            model: useModel,
        };

        return fetch(conf.backendURL + "/query", {
            method: "POST",
            headers: {
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
                if (isBackendResponse(data)) {
                    return data.response;
                } else {
                    throw "Bad response";
                }
            });
    }

    return (
        <Box className="verbal-web">
            <Tooltip title="Verbal Web AI assistant">
                <IconButton
                    color="primary"
                    size="large"
                    onClick={() => {
                        setOpen(true);
                    }}
                >
                    <AssistantIcon />
                </IconButton>
            </Tooltip>
            <VerbalWebDialog
                open={open}
                onClose={() => {
                    setOpen(false);
                }}
                onQuery={handleQuery}
            />
        </Box>
    );
}
