import { ChatMessage } from "../shared/api";
import AudioInput from "./AudioInput";
import { ChatClient, ChatConnectionState } from "./ChatClient";
import LoadingIndicator from "./LoadingIndicator";
import MarkdownContent from "./MarkdownContent";
import WelcomeView from "./WelcomeView";
import { useConfiguration } from "./context";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AssistantIcon from "@mui/icons-material/Assistant";
import MicIcon from "@mui/icons-material/Mic";
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
    Typography,
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

export default function ChatView({ client, fullHeight }: ChatViewProps) {
    const { t } = useTranslation();
    const conf = useConfiguration();
    const chatRef = useRef<HTMLElement>();
    const tailRef = useRef<HTMLElement>();
    const overflowRef = useRef<HTMLElement>();
    const msgsRef = useRef<HTMLElement>();
    const inputRef = useRef<HTMLTextAreaElement>();
    const theme = useTheme();
    const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));

    // messages stores previous queries and their responses
    const [messages, setMessages] = useState<ChatMessage[]>(client.chat.state.messages);
    // error message shown
    const [errorMessage, setErrorMessage] = useState<string>();
    // true when waiting for response from backend, used to disable submit-button and display progress circle
    const [waitingForResponse, setWaitingForResponse] = useState(false);
    const [inputEmpty, setInputEmpty] = useState(true);
    const [audioInput, setAudioInput] = useState<number>();

    // Open audio input
    function openAudioInput() {
        setAudioInput(Date.now());
    }

    // Close audio input
    function closeAudioInput() {
        setAudioInput(undefined);
    }

    // Set user input
    const setUserInput = (userInput: string) => {
        const input = inputRef.current;
        if (input) {
            input.value = userInput;
        }
        setInputEmpty(userInput.trim() === "");
    };

    const submitInput = (userInput: string) => {
        const ui = userInput;
        setUserInput("");
        setErrorMessage(undefined);
        client.submitMessage(ui);
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

    // Scroll to the bottom when there is new content, unless user has scrolled up
    useEffect(() => {
        msgsRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
        tailRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
    }, [messages, errorMessage, waitingForResponse]);

    // On mount and unmount
    useEffect(() => {
        client.addEventListener("chat", onChatChange);
        return () => {
            client.removeEventListener("chat", onChatChange);
        };
    }, []);

    const poweredByHtml = t("poweredByHtml");
    return (
        <>
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
                            msgsRef={msgsRef}
                            isSmallScreen={isSmallScreen}
                        />
                    </Box>
                </Suspense>
                <Box ref={tailRef} {...(fullHeight ? { sx: { flex: "0 0 auto" } } : {})}>
                    {errorMessage && (
                        <Box sx={{ mt: 2, ...(isSmallScreen || waitingForResponse ? {} : { pl: 12 }) }}>
                            <Alert variant="filled" severity="error">
                                {errorMessage}
                            </Alert>
                        </Box>
                    )}
                    {audioInput !== undefined && client.sharedConfig?.speechToText ? (
                        <AudioInput
                            key={audioInput}
                            onClose={() => {
                                closeAudioInput();
                            }}
                            sttConf={client.sharedConfig.speechToText}
                            client={client}
                        />
                    ) : !waitingForResponse ? (
                        <Box
                            sx={{
                                mt: 2,
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                ...(isSmallScreen ? {} : { pl: 12 }),
                            }}
                        >
                            <Box sx={{ flex: "1 1 auto" }}>
                                <ChatInput
                                    client={client}
                                    submitInput={submitInput}
                                    inputEmpty={inputEmpty}
                                    setInputEmpty={setInputEmpty}
                                    inputRef={inputRef}
                                    useAudioInput={() => {
                                        openAudioInput();
                                    }}
                                />
                            </Box>
                        </Box>
                    ) : (
                        <LinearProgress color={errorMessage ? "error" : "primary"} sx={{ marginTop: 1 }} />
                    )}
                </Box>
                {poweredByHtml.length > 0 && (
                    <Box {...(fullHeight ? { sx: { flex: "0 0 auto" } } : {})}>
                        <Typography
                            variant="body2"
                            dangerouslySetInnerHTML={{ __html: poweredByHtml }}
                            sx={{ mt: 2, textAlign: "right" }}
                        />
                    </Box>
                )}
            </Box>
        </>
    );
}

interface ChatInputProps extends StandardTextFieldProps {
    client: ChatClient;
    inputRef: React.MutableRefObject<HTMLTextAreaElement | undefined>;
    inputEmpty: boolean;
    setInputEmpty: React.Dispatch<React.SetStateAction<boolean>>;
    submitInput: (input: string) => void;
    useAudioInput: () => void;
}

function ChatInput({
    client,
    inputRef,
    inputEmpty,
    setInputEmpty,
    submitInput,
    useAudioInput,
    ...props
}: ChatInputProps) {
    const { t } = useTranslation();

    const audioSupported =
        typeof navigator.mediaDevices === "object" && typeof navigator.mediaDevices.getUserMedia === "function";
    const speechToTextSupported = audioSupported && client.sharedConfig?.speechToText !== undefined;

    const doSubmit = () => {
        const userInput = (inputRef.current?.value ?? "").trim();
        if (userInput !== "") {
            submitInput(userInput);
        }
    };

    const onInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter submits user input but enter+shift doesn't
        if (event.code === "Enter" && !event.shiftKey) {
            doSubmit();
            event.preventDefault();
        }
    };

    const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const ie = event.target.value.trim() === "";
        if (ie !== inputEmpty) {
            setInputEmpty(ie);
        }
    };

    // On mount and unmount
    useEffect(() => {
        const input = inputRef.current;
        if (input) {
            input.selectionStart = input.selectionEnd = input.value.length;
            input.focus({ preventScroll: true });
        }
    }, []);

    return (
        <TextField
            {...props}
            fullWidth
            multiline
            label={t("input.label")}
            onChange={onChange}
            inputRef={inputRef}
            slotProps={{
                input: {
                    onKeyDown: onInputKeyDown,
                    endAdornment: (
                        <InputAdornment position="end">
                            {speechToTextSupported && inputEmpty ? (
                                <Tooltip title={t("audio.input")}>
                                    <IconButton color="primary" onClick={useAudioInput}>
                                        <MicIcon />
                                    </IconButton>
                                </Tooltip>
                            ) : (
                                !inputEmpty && (
                                    <Tooltip title={t("input.submit")}>
                                        <IconButton color="primary" onClick={doSubmit}>
                                            <AssistantIcon />
                                        </IconButton>
                                    </Tooltip>
                                )
                            )}
                        </InputAdornment>
                    ),
                },
            }}
        />
    );
}

function ChatMessageListView({
    messages,
    msgsRef,
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
        <Box ref={msgsRef}>
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
