import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AssistantIcon from "@mui/icons-material/Assistant";
import CloseIcon from "@mui/icons-material/Close";
import {
    Avatar,
    Box,
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
import React, { useState } from "react";

interface VerbalWebDialogProps extends DialogProps {
    onClose: () => void;
    onQuery: (query: string) => Promise<string>;
}

interface VerbalWebDialogTitleProps extends DialogTitleProps {
    onClose: () => void;
}

interface VerbalWebMessageListProps {
    // TODO: Change to interfaceMessage objects
    messages: string[];
}

/*
function generateListItem(value: string): React.ReactElement {
    if (value.startsWith("Query: ")) {
        return (
            <ListItem>
                <ListItemAvatar>
                    <Avatar>
                        <AccountCircleIcon />
                    </Avatar>
                </ListItemAvatar>
                <ListItemText primary={value.replace("Query: ", "")} />
            </ListItem>
        );
    } else if (value.startsWith("Response: ")) {
        return (
            <ListItem>
                <ListItemAvatar>
                    <Avatar>
                        <AssistantIcon />
                    </Avatar>
                </ListItemAvatar>
                <ListItemText primary={value.replace("Response: ", "")} />
            </ListItem>
        );
    } else {
        throw "Message type not Query or Response";
    }
}
*/

export default function VerbalWebDialog(props: VerbalWebDialogProps) {
    const handleClose = props.onClose;
    const open = props.open;

    // userInput stores value of textField
    const [userInput, setUserInput] = useState("");
    // messages stores previous queries and their responses
    // TODO: Change to message objects
    const [messages, setMessages] = useState<Array<string>>([]);

    function addMessage(newMessage: string) {
        setMessages((messages) => [...messages, newMessage]);
    }

    // Update value of userInput when value of textField is changed
    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUserInput(event.target.value);
    };

    const handleSubmit = () => {
        // TODO: Only allow submit when textfield is not empty and response received from previous query
        addMessage("Query: " + userInput);
        console.log("Query: " + userInput);
        props.onQuery(userInput).then((response) => {
            addMessage("Response: " + response);
            console.log("Response: " + response);
            setUserInput("");
        });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter submits user input but enter+shift doesn't
        if (event.which === 13 && !event.shiftKey) {
            // TODO: handleSubmit if userInput.trim().length >= 5
            handleSubmit();
            // TODO: if userInput too short, show info alert to user
            event.preventDefault();
        }
    };

    const dialogProps = { ...props, onQuery: undefined };
    return (
        <Dialog {...dialogProps} fullWidth>
            <VerbalWebDialogTitle onClose={handleClose}>Verbal Web AI assistant</VerbalWebDialogTitle>
            <DialogContent dividers>
                <VerbalWebMessageList messages={messages}></VerbalWebMessageList>
                <TextField
                    fullWidth
                    multiline
                    label="Ask a question!"
                    value={userInput} // Value stored in state userInput
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
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
            </DialogContent>
        </Dialog>
    );
}

function VerbalWebDialogTitle(props: VerbalWebDialogTitleProps) {
    const { children, onClose, ...other } = props;

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
    const avatar = <AccountCircleIcon />;
    return (
        <List>
            {messages.map((m) => (
                <ListItem>
                    <ListItemAvatar>
                        <Avatar>{avatar}</Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={m} />
                </ListItem>
            ))}
        </List>
    );
}
