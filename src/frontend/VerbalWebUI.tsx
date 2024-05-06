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
    const [open, setOpen] = useState(false);

    function handleQuery(query: Message[]): Promise<string> {
        // Read page content, if so configured
        // TODO: only read text, not all html
        let pageContent;
        if (conf.pageContentSelector) {
            const nodeList = document.querySelectorAll(conf.pageContentSelector);
            // Page content to be added to the query
            let pc = "";
            nodeList.forEach((node) => {
                pc += node.outerHTML;
            });
            pageContent = pc;
        }

        const data: BackendRequest = {
            query: query,
            pageContent: pageContent,
            initialInstruction: conf.initialInstruction,
            model: conf.useModel,
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
                    throw new Error("Query failed");
                }
            })
            .then((data) => {
                if (isBackendResponse(data)) {
                    return data.response;
                } else {
                    throw new Error("Bad response");
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
