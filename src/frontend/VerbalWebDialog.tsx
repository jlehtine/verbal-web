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
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    TextField,
    Tooltip,
} from "@mui/material";
import { blue } from "@mui/material/colors";
import React, { useEffect, useRef, useState } from "react";

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

function createListItem(m: ChatMessage, id: number): React.JSX.Element {
    // pr = padding-right, pl = padding-left
    if (m.role === "user") {
        return (
            <ListItem key={id} sx={{ pl: 14, pr: 0 }}>
                <ListItemText
                    primary={m.content}
                    sx={{ whiteSpace: "pre-wrap", border: 2, padding: 2, marginRight: 2, borderRadius: 2 }}
                />
                <ListItemAvatar sx={{ marginRight: -2 }}>
                    <Avatar sx={{ bgcolor: blue[500] }}>
                        <AccountCircleIcon />
                    </Avatar>
                </ListItemAvatar>
            </ListItem>
        );
    } else {
        return (
            <ListItem key={id} sx={{ pr: 14, pl: 0 }}>
                <ListItemAvatar>
                    <Avatar sx={{ bgcolor: blue[500] }}>
                        <AssistantIcon />
                    </Avatar>
                </ListItemAvatar>
                <ListItemText
                    primary={m.content}
                    sx={{ whiteSpace: "pre-wrap", border: 2, padding: 2, borderRadius: 2 }}
                />
            </ListItem>
        );
    }
}

export default function VerbalWebDialog({ conf: conf, open: open, onClose: onClose }: VerbalWebDialogProps) {
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
            behavior: "smooth",
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
        <Dialog open={open} onClose={onClose} fullWidth>
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
                        color: (theme) => theme.palette.grey[500],
                    }}
                >
                    <CloseIcon />
                </IconButton>
            ) : null}
        </DialogTitle>
    );
}

function VerbalWebMessageList({ messages: messages }: VerbalWebMessageListProps) {
    return <List>{messages.map((m, idx) => createListItem(m, idx))}</List>;
}
