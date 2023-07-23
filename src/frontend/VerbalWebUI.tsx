import { BackendRequest, Message, isBackendResponse } from "../shared/api";
import VerbalWebDialog from "./VerbalWebDialog";
import AssistantIcon from "@mui/icons-material/Assistant";
import { Box, IconButton, Tooltip } from "@mui/material";
import React, { useState } from "react";

export interface VerbalWebConfiguration {
    backendURL: string;
    pageContentSelector: string;
}

interface VerbalWebUIProps {
    conf: VerbalWebConfiguration;
}

export default function VerbalWebUI({ conf }: VerbalWebUIProps) {
    // TODO: change default value
    const defaultPageContentSelector = "h1, h2, p";
    // Set default value if no pageContentSelector string given as conf parameter
    const pageContentSelector = conf.pageContentSelector ?? defaultPageContentSelector;

    const [open, setOpen] = useState(false);

    function handleQuery(query: Message[]): Promise<string> {
        const data: BackendRequest = { query: query };
        // Read page content
        // TODO: only read text, not all html
        const nodeList = document.querySelectorAll(pageContentSelector);
        // Page content to be added to the query
        let pageContent = "";
        nodeList.forEach((node) => {
            pageContent = pageContent + node.outerHTML;
        });
        console.log("nodeList(0): " + nodeList.item(0));
        console.log("nodeList length: " + nodeList.length);
        console.log("pageContentSelector: " + pageContentSelector);
        console.log("pageContent: " + pageContent);

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
