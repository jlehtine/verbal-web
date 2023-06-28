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
    Typography,
} from '@mui/material';
import React from 'react';

interface VerbalWebDialogProps extends DialogProps {
    onClose: () => void;
}

interface VerbalWebDialogTitleProps extends DialogTitleProps {
    onClose: () => void;
}

export default function VerbalWebDialog(props: VerbalWebDialogProps) {
    const handleClose = props.onClose;
    const open = props.open;

    return (
        <Dialog {...props} fullWidth>
            <VerbalWebDialogTitle onClose={handleClose}>Verbal Web AI assistant</VerbalWebDialogTitle>
            <DialogContent dividers>
                <TextField
                    fullWidth
                    multiline
                    label="Ask a question!"
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <Tooltip title="Submit">
                                    <IconButton color="primary" size="large">
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
        <DialogTitle>
            <Typography sx={{ paddingRight: 4 }} variant="subtitle1">
                {children}
            </Typography>
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
