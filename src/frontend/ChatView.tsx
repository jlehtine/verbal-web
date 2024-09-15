import { ChatMessage } from "../shared/api";
import { ChatClient, ChatConnectionState } from "./ChatClient";
import LoadingIndicator from "./LoadingIndicator";
import MarkdownContent from "./MarkdownContent";
import WelcomeView from "./WelcomeView";
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
    StandardTextFieldProps,
    TextField,
    Tooltip,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import React, { memo, MutableRefObject, PropsWithChildren, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ChatViewProps {
    client: ChatClient;
    fullHeight?: boolean;
    scrollRef?: MutableRefObject<HTMLElement | undefined>;
}

export default function ChatView({ client, fullHeight, scrollRef }: ChatViewProps) {
    const { t } = useTranslation();
    const conf = useConfiguration();
    const chatRef = useRef<HTMLElement>();
    const tailRef = useRef<HTMLElement>();
    const overflowRef = useRef<HTMLElement>();
    const theme = useTheme();
    const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));

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
    const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const text = event.target.value;
        setUserInput(text);
    };

    const onInputKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter submits user input but enter+shift doesn't
        if (event.code === "Enter" && !event.shiftKey) {
            submitInput();
            event.preventDefault();
        }
    };

    const submitInput = () => {
        // Only allowed to submit when textfield is not empty and response received from previous query
        if (!inputEmpty && !waitingForResponse) {
            setUserInput("");
            setErrorMessage(undefined);
            client.submitMessage(userInput);
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
        if (client.chat.error && !client.chat.backendProcessing) {
            setUserInput(client.chat.failedUserInput);
        }
    }

    // Detect user scrolling up
    let lastTop = chatRef.current?.getBoundingClientRect().top;
    function onScroll() {
        const br = chatRef.current?.getBoundingClientRect();
        const nowTop = br?.top;
        if (br && lastTop !== undefined && nowTop !== undefined) {
            if (nowTop > lastTop && br.bottom > innerHeight + 20) {
                setUserScrolledUp(true);
            } else if (nowTop < lastTop && br.bottom < innerHeight + 20) {
                setUserScrolledUp(false);
            }
        }
        lastTop = nowTop;
    }

    // Scroll to the bottom when there is new content, unless user has scrolled up
    let scrollTimeout: number | undefined;
    let scrollPending = false;
    const scrollDown = () => {
        tailRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
        if (scrollPending) {
            scrollTimeout = setTimeout(scrollDown, 200);
        } else {
            scrollTimeout = undefined;
        }
    };
    useEffect(() => {
        if (!userScrolledUp) {
            if (scrollTimeout === undefined) {
                scrollTimeout = setTimeout(scrollDown, 200);
            } else {
                scrollPending = true;
            }
        }
    }, [messages, errorMessage, waitingForResponse, userScrolledUp]);

    // On mount and unmount
    useEffect(() => {
        client.addEventListener("chat", onChatChange);
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
            client.removeEventListener("chat", onChatChange);
            if (scrollTimeout !== undefined) {
                clearTimeout(scrollTimeout);
                scrollTimeout = undefined;
            }
        };
    }, []);

    return (
        <Box
            ref={chatRef}
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
                    <ChatMessageListView
                        messages={messages}
                        waitingForResponse={waitingForResponse}
                        isSmallScreen={isSmallScreen}
                    />
                </Box>
            </Suspense>
            <Box ref={tailRef} {...(fullHeight ? { sx: { flex: "0 0 auto" } } : {})}>
                {errorMessage ? (
                    <Box sx={{ mt: 2, ...(isSmallScreen || waitingForResponse ? {} : { pl: 12 }) }}>
                        <Alert variant="filled" severity="error">
                            {errorMessage}
                        </Alert>
                    </Box>
                ) : null}
                {!waitingForResponse && (
                    <Box sx={{ mt: 2, ...(isSmallScreen ? {} : { pl: 12 }) }}>
                        <ChatInput
                            value={userInput}
                            onChange={onInputChange}
                            onKeyDown={onInputKeyDown}
                            submitInput={submitInput}
                        />
                    </Box>
                )}
                {waitingForResponse ? (
                    <LinearProgress color={errorMessage ? "error" : "primary"} sx={{ marginTop: 1 }} />
                ) : null}
            </Box>
        </Box>
    );
}

interface ChatInputProps extends StandardTextFieldProps {
    submitInput: () => void;
}

function ChatInput({ submitInput, ...props }: ChatInputProps) {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLTextAreaElement>();

    // On mount and unmount
    useEffect(() => {
        const input = inputRef.current;
        if (input) {
            input.selectionStart = input.selectionEnd = input.value.length;
            input.focus();
        }
    }, []);

    return (
        <TextField
            {...props}
            fullWidth
            multiline
            label={t("input.label")}
            inputRef={inputRef}
            slotProps={{
                input: {
                    endAdornment: (
                        <InputAdornment position="end">
                            <Tooltip title={t("input.submit")}>
                                <IconButton color="primary" size="large" onClick={submitInput}>
                                    <AssistantIcon />
                                </IconButton>
                            </Tooltip>
                        </InputAdornment>
                    ),
                },
            }}
        />
    );
}

function ChatMessageListView({
    messages,
    waitingForResponse,
    isSmallScreen,
}: {
    messages: ChatMessage[];
    msgsRef?: React.Ref<unknown>;
    waitingForResponse: boolean;
    isSmallScreen: boolean;
}) {
    const MemoizedWelcomeView = memo(WelcomeView);
    return (
        <Box>
            <MemoizedWelcomeView />
            <Stack spacing={2}>
                {messages.map((m, idx, array) => (
                    <ChatMessageView
                        key={idx}
                        msg={m}
                        completed={!waitingForResponse || idx < array.length - 1}
                        isSmallScreen={isSmallScreen}
                    />
                ))}
            </Stack>
        </Box>
    );
}

function ChatMessageView({
    msg,
    completed,
    isSmallScreen,
}: PropsWithChildren<{ msg: ChatMessage; completed: boolean; isSmallScreen: boolean }>) {
    const um = msg.role === "user";
    const MemoizedMarkdownContent = memo(MarkdownContent);
    return (
        <Box sx={um ? { pl: 4 } : { pr: 4 }}>
            <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent={um ? "flex-end" : "flex-start"}>
                {!isSmallScreen && (
                    <Box sx={{ pt: 1 }}>
                        <Avatar {...(!um ? { sx: { bgcolor: "primary.main" } } : {})}>
                            {um ? <AccountCircleIcon /> : <AssistantIcon />}
                        </Avatar>
                    </Box>
                )}
                <Paper sx={{ pl: 2, pr: 2 }}>
                    <MemoizedMarkdownContent content={msg.content} completed={completed} />
                </Paper>
            </Stack>
        </Box>
    );
}
