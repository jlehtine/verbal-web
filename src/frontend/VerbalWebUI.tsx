import { BackendRequest, isBackendResponse } from "../shared/api";
import VerbalWebDialog from "./VerbalWebDialog";
import AssistantIcon from "@mui/icons-material/Assistant";
import { Box, IconButton, Tooltip } from "@mui/material";
import React, { useState } from "react";

export interface VerbalWebConfiguration {
    backendURL: string;
}

interface VerbalWebUIProps {
    conf: VerbalWebConfiguration;
}

export default function VerbalWebUI({ conf }: VerbalWebUIProps) {
    const [open, setOpen] = useState(false);

    function handleQuery(query: string): Promise<string> {
        const data: BackendRequest = { query: query };

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
        <Box>
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
