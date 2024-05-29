import { ChatMessage } from "../shared/api";
import { ChatClient, ChatConnectionState } from "./ChatClient";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { extract } from "./extract";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AssistantIcon from "@mui/icons-material/Assistant";
import CloseIcon from "@mui/icons-material/Close";
import {
    Alert,
    Avatar,
    Box,
    Dialog,
    DialogContent,
    DialogProps,
    DialogTitle,
    DialogTitleProps,
    IconButton,
    InputAdornment,
    LinearProgress,
    Stack,
    TextField,
    Tooltip,
    Paper,
    useMediaQuery,
    useTheme,
    GlobalStyles,
} from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface VerbalWebDialogProps extends DialogProps {
    conf: VerbalWebConfiguration;
    open: boolean;
    onClose: () => void;
}

interface VerbalWebDialogTitleProps extends DialogTitleProps {
    onClose?: () => void;
}

interface VerbalWebMessageListProps {
    messages: ChatMessage[];
}

// Global styles for Markdown component
const globalStyles = (
    <GlobalStyles
        styles={{
            ".vw-markdown-message": {
                fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
                fontSize: "16px",
                fontWeight: 400,
            },
            ".vw-markdown-message table": {
                color: "inherit",
            },
        }}
    />
);

function createListItem(m: ChatMessage, id: number): React.JSX.Element {
    const um = m.role === "user";
    return (
        <Box key={id} sx={um ? { pr: 4 } : { pl: 4 }}>
            <Paper variant="outlined">
                <Box sx={{ padding: 1, float: um ? "left" : "right" }}>
                    <Avatar sx={{ bgcolor: "primary.main" }}>{um ? <AccountCircleIcon /> : <AssistantIcon />}</Avatar>
                </Box>
                <Box sx={{ pl: 2, pr: 2 }}>
                    <Markdown className="vw-markdown-message" remarkPlugins={[remarkGfm]}>
                        {m.content}
                    </Markdown>
                </Box>
                <Box sx={{ clear: um ? "left" : "right" }} />
            </Paper>
        </Box>
    );
}

export default function VerbalWebDialog({ conf: conf, open: open, onClose: onClose }: VerbalWebDialogProps) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const tailRef = useRef<HTMLDivElement>(null);

    // Chat client containing also state and model
    // This is not used directly for rendering but has the same lifecycle as the component
    const [client] = useState(
        () =>
            new ChatClient(conf.backendURL, {
                initialInstruction: conf.initialInstruction,
                pageContent: extract(conf.pageContentSelector),
                model: conf.useModel,
            }),
    );
    client.addEventListener("change", onChatChange);

    // userInput stores value of textField
    const [userInput, setUserInput] = useState("");
    // messages stores previous queries and their responses
    const [messages, setMessages] = useState<ChatMessage[]>(client.chat.state.messages);
    // error message shown
    const [errorMessage, setErrorMessage] = useState<string>();
    // true when waiting for response from backend, used to disable submit-button and display progress circle
    const [waitingForResponse, setWaitingForResponse] = useState(false);

    // Check user input length
    const inputEmpty = userInput.trim().length == 0;

    // Update value of userInput when value of textField is changed
    // Update value of allowSubmit
    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const text = event.target.value;
        setUserInput(text);
    };

    const handleSubmit = () => {
        // Only allowed to submit when textfield is not empty and response received from previous query
        if (!inputEmpty && !waitingForResponse) {
            client.submitMessage(userInput);
            setUserInput("");
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter submits user input but enter+shift doesn't
        if (event.which === 13 && !event.shiftKey) {
            handleSubmit();
            event.preventDefault();
        }
    };

    function onChatChange() {
        setMessages([...client.chat.state.messages]);
        let errorMessage;
        if (client.connectionState === ChatConnectionState.ERROR) {
            errorMessage = "Connection error, retrying...";
        } else if (client.chat.error !== undefined) {
            switch (client.chat.error) {
                case "chat":
                    errorMessage = "AI assistant failed!";
                    break;
                case "connection":
                    errorMessage = "Failed to contact AI assistant!";
                    break;
                case "moderation":
                    errorMessage = "Message was blocked by moderation!";
                    break;
                case "limit":
                    errorMessage = "Message was blocked by chat usage limits!";
                    break;
            }
        }
        setErrorMessage(errorMessage);
        setWaitingForResponse(client.chat.backendProcessing);
    }

    // Scroll to the bottom when there is new content
    useEffect(() => {
        tailRef.current?.scrollIntoView({
            behavior: "instant",
            block: "end",
        });
    }, [messages, errorMessage, waitingForResponse]);

    // Close chat client on unmount
    useEffect(
        () => () => {
            client.close();
        },
        [],
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            {...(fullScreen ? { fullScreen: true } : { fullWidth: true, maxWidth: "lg" })}
        >
            {globalStyles}
            <VerbalWebDialogTitle onClose={onClose}>Verbal Web AI assistant</VerbalWebDialogTitle>
            <DialogContent dividers>
                <VerbalWebMessageList messages={messages}></VerbalWebMessageList>
                {!waitingForResponse && errorMessage === undefined ? (
                    <TextField
                        fullWidth
                        multiline
                        label="Ask a question!"
                        value={userInput} // Value stored in state userInput
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        inputRef={(input: unknown) => {
                            if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
                                input.focus();
                            }
                        }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <Tooltip title="Submit">
                                        <IconButton color="primary" size="large" onClick={handleSubmit}>
                                            <AssistantIcon />
                                        </IconButton>
                                    </Tooltip>
                                </InputAdornment>
                            ),
                        }}
                        sx={{ mt: 2 }}
                    ></TextField>
                ) : null}
                {errorMessage ? (
                    <Alert variant="filled" severity="error">
                        {errorMessage}
                    </Alert>
                ) : null}
                {waitingForResponse ? (
                    <LinearProgress color={errorMessage ? "error" : "primary"} sx={{ marginTop: 1 }} />
                ) : null}
                <Box ref={tailRef} />
            </DialogContent>
        </Dialog>
    );
}

function VerbalWebDialogTitle(props: VerbalWebDialogTitleProps) {
    const { children, onClose } = props;

    return (
        <DialogTitle variant="subtitle1" sx={{ paddingRight: 4 }}>
            {children}
            {onClose ? (
                <IconButton
                    aria-label="close"
                    onClick={onClose}
                    sx={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                    }}
                >
                    <CloseIcon />
                </IconButton>
            ) : null}
        </DialogTitle>
    );
}

function VerbalWebMessageList({ messages: messages }: VerbalWebMessageListProps) {
    return <Stack spacing={2}>{messages.map((m, idx) => createListItem(m, idx))}</Stack>;
}
