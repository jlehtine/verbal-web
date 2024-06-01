import { ChatMessage } from "../shared/api";
import { ChatClient, ChatConnectionState } from "./ChatClient";
import LoadingIndicator from "./LoadingIndicator";
import { VerbalWebContext } from "./context";
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
    PaletteMode,
} from "@mui/material";
import React, { PropsWithChildren, Suspense, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { logThrownError } from "./log";
import { VerbalWebError } from "../shared/error";
import load from "./load";
import VerbalWebConfiguration from "./VerbalWebConfiguration";

interface VerbalWebDialogProps extends DialogProps {
    open: boolean;
    onClose: () => void;
}

interface VerbalWebDialogTitleProps extends DialogTitleProps {
    onClose?: () => void;
}

interface VerbalWebMessageListProps {
    messages: ChatMessage[];
    waitingForResponse: boolean;
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

let highlightStyle: HTMLStyleElement | undefined;
let highlightMode: PaletteMode | undefined;

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

interface CssModule {
    default: [[unknown, string]];
}

function isCssModule(v: unknown): v is CssModule {
    return (
        isObject(v) &&
        Array.isArray(v.default) &&
        v.default.length > 0 &&
        Array.isArray(v.default[0]) &&
        v.default[0].length > 1 &&
        typeof v.default[0][1] === "string"
    );
}

function getCssContent(module: unknown): string {
    if (isCssModule(module)) {
        return module.default[0][1];
    } else {
        throw new VerbalWebError("Not a CSS module");
    }
}

/**
 * Loads and sets the highlighting styles.
 *
 * @param mode palette mode
 */
function setHighlightPaletteMode(mode: PaletteMode, conf: VerbalWebConfiguration) {
    // Check if mode changed
    if (mode !== highlightMode) {
        // Set mode
        highlightMode = mode;

        // Load highlight styles, if necessary
        (mode === "light"
            ? load(
                  "highligh.js/styles/light",
                  conf,
                  "extra",
                  () => import("highlight.js/styles/stackoverflow-light.min.css"),
              )
            : load(
                  "highligh.js/styles/dark",
                  conf,
                  "extra",
                  () => import("highlight.js/styles/stackoverflow-dark.min.css"),
              )
        )
            .then((module) => {
                if (!highlightStyle) {
                    highlightStyle = document.createElement("style");
                    document.head.appendChild(highlightStyle);
                }
                if (mode === highlightMode) {
                    highlightStyle.innerHTML = getCssContent(module);
                }
            })
            .catch((err: unknown) => {
                logThrownError("Failed to load syntax highlighting styles", err);
            });
    }
}

/**
 * Highlights the specified HTML elements.
 *
 * @param nodes nodes to be highlighted
 * @param mode palette mode
 */
function highlight(elem: HTMLElement, completed: boolean, mode: PaletteMode, conf: VerbalWebConfiguration) {
    const selector = "pre code";
    const nodes = elem.querySelectorAll(selector);
    if (nodes.length > 0) {
        setHighlightPaletteMode(mode, conf);
        load("highlight.js", conf, "extra", () => import("highlight.js"))
            .then(({ default: hljs }) => {
                for (const n of elem.querySelectorAll(selector + ':not([data-highlighted="yes"]')) {
                    if (n instanceof HTMLElement) {
                        if (
                            completed ||
                            n.nextElementSibling instanceof Element ||
                            n.parentElement?.nextElementSibling instanceof Element
                        ) {
                            hljs.highlightElement(n);
                        }
                    }
                }
            })
            .catch((err: unknown) => {
                logThrownError("Syntax highlighting failed", err);
            });
    }
}

/**
 * Component for handling markdown and code snippet content.
 */
function MarkdownContent({ content, completed }: { content: string; completed: boolean }) {
    const { conf } = useContext(VerbalWebContext);
    const theme = useTheme();
    const selfRef = useRef<HTMLElement>();

    // Highlight, if highlighting not disabled
    useEffect(() => {
        if (conf.highlight !== false) {
            if (selfRef.current) {
                highlight(selfRef.current, completed, theme.palette.mode, conf);
            }
        }
    }, [content, completed]);

    return (
        <Box ref={selfRef}>
            <Markdown className="vw-markdown-message" remarkPlugins={[remarkGfm]}>
                {content}
            </Markdown>
        </Box>
    );
}

function ChatMessage({ msg, completed }: PropsWithChildren<{ msg: ChatMessage; completed: boolean }>) {
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

export default function VerbalWebDialog({ open: open, onClose: onClose }: VerbalWebDialogProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

    return (
        <Dialog
            open={open}
            onClose={onClose}
            {...(fullScreen ? { fullScreen: true } : { fullWidth: true, maxWidth: "lg" })}
        >
            {globalStyles}
            <VerbalWebDialogTitle onClose={onClose}>{t("dialog.title")}</VerbalWebDialogTitle>
            <VerbalWebDialogContent />
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

function VerbalWebDialogContent() {
    const { conf } = useContext(VerbalWebContext);
    const { t } = useTranslation();
    const theme = useTheme();
    const ref = useRef<HTMLDivElement>();

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

    // Switch highlight palette on light/dark mode changes
    useEffect(() => {
        if (highlightMode !== undefined) {
            setHighlightPaletteMode(theme.palette.mode, conf);
        }
    }, [theme.palette.mode]);

    // On mount and unmount
    useEffect(() => {
        console.debug("Mounting...");
        ref.current?.addEventListener("scroll", onScroll);
        return () => {
            console.debug("Unmounting...");
            ref.current?.removeEventListener("scroll", onScroll);
            client.close();
        };
    }, []);

    let lastScrollTop = ref.current?.scrollTop ?? 0;
    const onScroll = () => {
        console.debug("onScroll");
        const c = ref.current;
        if (c) {
            console.debug("lastScrollTop = %d, scrollTop = %d", lastScrollTop, c.scrollTop);
            if (c.scrollTop < lastScrollTop) {
                setUserScrolledUp(true);
            } else if (c.scrollTop > lastScrollTop && c.scrollTop + c.clientHeight > c.scrollHeight - 20) {
                setUserScrolledUp(false);
            }
            lastScrollTop = c.scrollTop;
        }
    };

    // Scroll to the bottom when there is new content, unless user has scrolled up
    useEffect(() => {
        const c = ref.current;
        if (c && !userScrolledUp) {
            if (c.scrollTop + c.clientHeight < c.scrollHeight) {
                c.scrollTop = c.scrollHeight - c.clientHeight;
            }
        }
    }, [messages, errorMessage, waitingForResponse]);

    return (
        <DialogContent dividers ref={ref}>
            <Suspense fallback={<LoadingIndicator />}>
                <VerbalWebMessageList
                    messages={messages}
                    waitingForResponse={waitingForResponse}
                ></VerbalWebMessageList>
            </Suspense>
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
        </DialogContent>
    );
}

function VerbalWebMessageList({ messages, waitingForResponse }: VerbalWebMessageListProps) {
    return (
        <Stack spacing={2}>
            {messages.map((m, idx, array) => (
                <ChatMessage key={idx} msg={m} completed={!waitingForResponse || idx < array.length - 1} />
            ))}
        </Stack>
    );
}
