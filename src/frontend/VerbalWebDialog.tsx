import AssistantIcon from '@mui/icons-material/Assistant';
import CloseIcon from '@mui/icons-material/Close';
import {
    Box,
    Dialog,
    DialogContent,
    DialogProps,
    DialogTitle,
    DialogTitleProps,
    IconButton,
    InputAdornment,
    TextField,
    Tooltip,
} from '@mui/material';
import React, { useState } from 'react';

interface VerbalWebDialogProps extends DialogProps {
    onClose: () => void;
    onQuery: (query: string) => Promise<string>;
}

interface VerbalWebDialogTitleProps extends DialogTitleProps {
    onClose: () => void;
}

export default function VerbalWebDialog(props: VerbalWebDialogProps) {
    const handleClose = props.onClose;
    const open = props.open;

    // userInput stores value of textField
    const [userInput, setUserInput] = useState('');

    // Update value of userInput when value of textField is changed
    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUserInput(event.target.value);
    };

    const handleSubmit = () => {
        console.log('Query: ' + userInput);
        props.onQuery(userInput).then((response) => {
            console.log('Response: ' + response);
            setUserInput('');
        });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter submits user input but enter+shift doesn't
        if (event.which === 13 && !event.shiftKey) {
            handleSubmit();
            event.preventDefault();
        }
    };

    return (
        <Dialog {...props} fullWidth>
            <VerbalWebDialogTitle onClose={handleClose}>Verbal Web AI assistant</VerbalWebDialogTitle>
            <DialogContent dividers>
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
                    }}></TextField>
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
                        position: 'absolute',
                        right: 8,
                        top: 8,
                        color: (theme) => theme.palette.grey[500],
                    }}>
                    <CloseIcon />
                </IconButton>
            ) : null}
        </DialogTitle>
    );
}
