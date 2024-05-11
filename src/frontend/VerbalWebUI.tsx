import { BackendRequest, Message, isBackendResponse } from "../shared/api";
import { VerbalWebConfigurationError } from "../shared/error";
import VerbalWebDialog, { VERBAL_WEB_ASSISTANT_DIALOG_CLASS_NAME } from "./VerbalWebDialog";
import AssistantIcon from "@mui/icons-material/Assistant";
import { Box, IconButton, Tooltip } from "@mui/material";
import React, { useState } from "react";

export interface VerbalWebConfiguration {
    backendURL: string;
    pageContentSelector?: string;
    initialInstruction?: string;
    useModel?: string;
}

interface VerbalWebUIProps {
    conf: VerbalWebConfiguration;
}

/** HTML class name for the Verbal Web assistant */
const VERBAL_WEB_ASSISTANT_CLASS_NAME = "verbal-web-assistant";

export default function VerbalWebUI({ conf }: VerbalWebUIProps) {
    const [open, setOpen] = useState(false);

    function handleQuery(query: Message[]): Promise<string> {
        // Read page content, if so configured
        let pageContent;
        if (conf.pageContentSelector) {
            pageContent = extractPageContent(conf.pageContentSelector);
        }

        const data: BackendRequest = {
            query: query,
            pageContent: pageContent,
            initialInstruction: conf.initialInstruction,
            model: conf.useModel,
        };

        return fetch(getBackendBaseURL(conf) + "query", {
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
        <Box className={VERBAL_WEB_ASSISTANT_CLASS_NAME}>
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

function getBackendBaseURL(conf: VerbalWebConfiguration) {
    let baseURL = conf.backendURL;
    if (baseURL && !baseURL.endsWith("/")) {
        baseURL += "/";
    }
    return baseURL;
}

function extractPageContent(pageContentSelector: string): string {
    // Get the node list
    let elems;
    try {
        elems = document.querySelectorAll(pageContentSelector);
    } catch (err) {
        throw new VerbalWebConfigurationError("Invalid page content selector: " + pageContentSelector, { cause: err });
    }

    // Extract content from nodes
    let pc = "";
    const processedElems: Element[] = [];
    for (const elem of elems) {
        // Ignore if already contained in some other processed element
        if (!isContainedIn(elem, processedElems)) {
            // Include all rendered text
            pc += extractPageContentForElement(elem);

            processedElems.push(elem);
        }
    }

    // Remove content from the assistant elements
    for (const elem of document.querySelectorAll(
        "." + VERBAL_WEB_ASSISTANT_CLASS_NAME + ", ." + VERBAL_WEB_ASSISTANT_DIALOG_CLASS_NAME,
    )) {
        if (elem instanceof HTMLElement && isContainedIn(elem, processedElems)) {
            pc = pc.replace(elem.innerText, "");
        }
    }

    return pc;
}

function isContainedIn(elem: Element, elems: Element[]): boolean {
    let n: Element | null = elem;
    while (n) {
        if (elems.includes(n)) {
            return true;
        }
        n = n.parentElement;
    }
    return false;
}

function extractPageContentForElement(elem: Element): string {
    let pc = "";
    if (elem instanceof HTMLElement) {
        pc = elem.innerText;
    } else {
        for (const child of elem.children) {
            pc += extractPageContentForElement(child);
        }
    }
    return pc;
}
