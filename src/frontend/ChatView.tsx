import { ChatMessage } from "../shared/api";
import { ChatClient, ChatConnectionState } from "./ChatClient";
import LoadingIndicator from "./LoadingIndicator";
import MarkdownContent from "./MarkdownContent";
import MarkdownContentSupport from "./MarkdownContentSupport";
import { useConfiguration } from "./context";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AssistantIcon from "@mui/icons-material/Assistant";
import {
    Alert,
    Avatar,
    Box,
    IconButton,
    InputAdornment,
    LinearProgress,
    Paper,
    Stack,
    TextField,
    Tooltip,
} from "@mui/material";
import React, { MutableRefObject, PropsWithChildren, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ChatViewProps {
    client: ChatClient;
    fullHeight?: boolean;
    scrollRef?: MutableRefObject<HTMLElement | undefined>;
}

export default function ChatView({ client, fullHeight, scrollRef }: ChatViewProps) {
    const { t } = useTranslation();
    const conf = useConfiguration();
    const ref = useRef<HTMLElement>();
    const overflowRef = useRef<HTMLElement>();
    const msgsRef = useRef<HTMLElement>();

    // userInput stores value of textField
    const [userInput, setUserInput] = useState("");
    // messages stores previous queries and their responses
    const [messages, setMessages] = useState<ChatMessage[]>(client.chat.state.messages);
    // error message shown
    const [errorMessage, setErrorMessage] = useState<string>();
    // true when waiting for response from backend, used to disable submit-button and display progress circle
    const [waitingForResponse, setWaitingForResponse] = useState(false);
    // whether user has scrolled the window up
    const [userScrolledUp, setUserScrolledUp] = useState(false);

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
            errorMessage = t("error.backendConnection");
        } else if (client.chat.error !== undefined) {
            switch (client.chat.error) {
                case "chat":
                    errorMessage = t("error.chat");
                    break;
                case "connection":
                    errorMessage = t("error.connection");
                    break;
                case "moderation":
                    errorMessage = t("error.moderation");
                    break;
                case "limit":
                    errorMessage = t("error.limit");
                    break;
            }
        }
        setErrorMessage(errorMessage);
        setWaitingForResponse(client.chat.backendProcessing);
    }

    // Detect user scrolling up
    let lastTop = msgsRef.current?.getBoundingClientRect().top;
    function onScroll() {
        const br = msgsRef.current?.getBoundingClientRect();
        const nowTop = br?.top;
        if (br && lastTop !== undefined && nowTop !== undefined) {
            if (nowTop > lastTop) {
                setUserScrolledUp(true);
            } else if (nowTop < lastTop && br.bottom < innerHeight + 20) {
                setUserScrolledUp(false);
            }
        }
        lastTop = nowTop;
    }

    // Scroll to the bottom when there is new content, unless user has scrolled up
    useEffect(() => {
        if (!userScrolledUp) {
            msgsRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
            ref.current?.scrollIntoView({ block: "end", behavior: "instant" });
        }
    }, [messages, errorMessage, waitingForResponse, userScrolledUp]);

    // On mount and unmount
    useEffect(() => {
        client.addEventListener("change", onChatChange);
        [scrollRef?.current, overflowRef.current, window].forEach((r) => {
            if (r) {
                r.addEventListener("scroll", onScroll);
            }
        });
        return () => {
            [window, overflowRef.current, scrollRef?.current].forEach((r) => {
                if (r) {
                    r.removeEventListener("scroll", onScroll);
                }
            });
        };
    }, []);

    return (
        <Box
            ref={ref}
            {...(fullHeight
                ? { sx: { height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" } }
                : {})}
        >
            <Suspense fallback={<LoadingIndicator conf={conf} />}>
                <Box
                    {...(fullHeight
                        ? {
                              sx: {
                                  flex: "0 1 auto",
                                  overflowY: "auto",
                                  "&::-webkit-scrollbar": {
                                      display: "none",
                                  },
                                  msOverflowStyle: "none",
                                  scrollbarWidth: "none",
                              },
                              ref: overflowRef,
                          }
                        : {})}
                >
                    <MarkdownContentSupport>
                        <ChatMessageListView
                            messages={messages}
                            waitingForResponse={waitingForResponse}
                            msgsRef={msgsRef}
                        />
                    </MarkdownContentSupport>
                </Box>
            </Suspense>
            <Box {...(fullHeight ? { sx: { flex: "0 0 auto" } } : {})}>
                {!waitingForResponse && errorMessage === undefined ? (
                    <TextField
                        fullWidth
                        multiline
                        label={t("input.label")}
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
            </Box>
        </Box>
    );
}

function ChatMessageListView({
    messages,
    msgsRef,
    waitingForResponse,
}: {
    messages: ChatMessage[];
    msgsRef?: React.Ref<unknown>;
    waitingForResponse: boolean;
}) {
    return (
        <Box ref={msgsRef}>
            <Stack spacing={2}>
                {messages.map((m, idx, array) => (
                    <ChatMessageView key={idx} msg={m} completed={!waitingForResponse || idx < array.length - 1} />
                ))}
            </Stack>
        </Box>
    );
}

function ChatMessageView({ msg, completed }: PropsWithChildren<{ msg: ChatMessage; completed: boolean }>) {
    const um = msg.role === "user";
    return (
        <Box sx={um ? { pr: 4 } : { pl: 4 }}>
            <Paper variant="outlined">
                <Box sx={{ padding: 1, float: um ? "left" : "right" }}>
                    <Avatar sx={{ bgcolor: "primary.main" }}>{um ? <AccountCircleIcon /> : <AssistantIcon />}</Avatar>
                </Box>
                <Box sx={{ pl: 2, pr: 2 }}>
                    <MarkdownContent content={msg.content} completed={completed} />
                </Box>
                <Box sx={{ clear: um ? "left" : "right" }} />
            </Paper>
        </Box>
    );
}
