import { Message } from "../shared/api";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AssistantIcon from "@mui/icons-material/Assistant";
import CloseIcon from "@mui/icons-material/Close";
import {
    Avatar,
    CircularProgress,
    Dialog,
    DialogContent,
    DialogProps,
    DialogTitle,
    DialogTitleProps,
    IconButton,
    InputAdornment,
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
    onClose: () => void;
    onQuery: (query: Message[]) => Promise<string>;
}

interface VerbalWebDialogTitleProps extends DialogTitleProps {
    onClose?: () => void;
}

interface VerbalWebMessageListProps {
    messages: Message[];
}

function createListItem(m: Message, id: number): React.JSX.Element {
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

export default function VerbalWebDialog(props: VerbalWebDialogProps) {
    const handleClose = props.onClose;
    const inputRef = useRef<HTMLDivElement>(null);

    // userInput stores value of textField
    const [userInput, setUserInput] = useState("");
    // messages stores previous queries and their responses
    const [messages, setMessages] = useState<Message[]>([]);
    // true if userInput longer than 5 chars, updated in handleInputChange
    const [inputTooShort, setInputTooShort] = useState(true);
    // true if trying to submit too short message
    const [showError, setShowError] = useState(false);
    // text shown under input textField
    const [textFieldHelperText, setTextFieldHelperText] = useState("");
    // true when waiting for response from backend, used to disable submit-button and display progress circle
    const [waitingForResponse, setWaitingForResponse] = useState(false);

    function addMessage(newMessage: Message) {
        setMessages((messages) => [...messages, newMessage]);
    }

    // Update value of userInput when value of textField is changed
    // Update value of allowSubmit
    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const text = event.target.value;
        setUserInput(text);
        if (text.trim().length < 5) {
            setInputTooShort(true);
        } else if (!waitingForResponse) {
            setInputTooShort(false);
            setShowError(false);
            setTextFieldHelperText("");
        }
    };

    const handleSubmit = () => {
        // Only allowed to submit when textfield is not empty and response received from previous query
        if (!inputTooShort && !waitingForResponse) {
            setShowError(false);
            const queryMessage: Message = { role: "user", content: userInput };

            console.log("Query: " + userInput);
            setWaitingForResponse(true);
            setTextFieldHelperText("Waiting for response to message!");
            props
                .onQuery([...messages, queryMessage])
                .then((response) => {
                    setWaitingForResponse(false);
                    addMessage(queryMessage);
                    addMessage({ role: "assistant", content: response });
                    console.log("Response: " + response);
                    setUserInput("");
                    setInputTooShort(true);
                    setShowError(false);
                    setTextFieldHelperText("");
                })
                .catch((err: unknown) => {
                    console.error(err);
                    setWaitingForResponse(false);
                    setShowError(true);
                    setTextFieldHelperText(describeError(err));
                });
        } else {
            setShowError(true);
            setTextFieldHelperText("Message must be longer than 5 characters!");
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter submits user input but enter+shift doesn't
        if (event.which === 13 && !event.shiftKey) {
            handleSubmit();
            event.preventDefault();
        }
    };

    const dialogProps = { ...props, onQuery: undefined };

    useEffect(() => {
        inputRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "end",
        });
    }, [messages, textFieldHelperText]);

    return (
        <Dialog {...dialogProps} fullWidth>
            <VerbalWebDialogTitle onClose={handleClose}>Verbal Web AI assistant</VerbalWebDialogTitle>
            <DialogContent dividers>
                <VerbalWebMessageList messages={messages}></VerbalWebMessageList>
                <TextField
                    error={showError}
                    disabled={waitingForResponse}
                    fullWidth
                    multiline
                    label="Ask a question!"
                    helperText={textFieldHelperText}
                    value={userInput} // Value stored in state userInput
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    ref={inputRef}
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <Tooltip title="Submit">
                                    <IconButton
                                        color="primary"
                                        size="large"
                                        onClick={handleSubmit}
                                        disabled={waitingForResponse}
                                    >
                                        <AssistantIcon />
                                    </IconButton>
                                </Tooltip>
                                {waitingForResponse && (
                                    <CircularProgress
                                        sx={{
                                            position: "absolute",
                                            right: "3%",
                                        }}
                                    />
                                )}
                            </InputAdornment>
                        ),
                    }}
                ></TextField>
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

function VerbalWebMessageList(props: VerbalWebMessageListProps) {
    const messages = props.messages;
    return <List>{messages.map((m, idx) => createListItem(m, idx))}</List>;
}

function describeError(err: unknown): string {
    let details = undefined;
    if (err instanceof Error) {
        details = err.message;
    } else if (typeof err === "string") {
        details = err;
    }
    return "ERROR" + (details !== undefined ? ": " + details : "");
}
