import CloseIcon from '@mui/icons-material/Close';
import { Dialog, DialogProps, DialogTitle, DialogTitleProps, IconButton, TextField } from '@mui/material';
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
        <Dialog {...props}>
            <VerbalWebDialogTitle onClose={handleClose}>Verbal Web AI assistant</VerbalWebDialogTitle>
            <TextField></TextField>
        </Dialog>
    );
}

function VerbalWebDialogTitle(props: VerbalWebDialogTitleProps) {
    const { children, onClose, ...other } = props;

    return (
        <DialogTitle>
            {children}
            {onClose ? (
                <IconButton
                    aria-label="close"
                    onClick={onClose}
                    sx={
                        {
                            /*
                        position: 'absolute',
                        right: 8,
                        top: 8,
                        color: (theme) => theme.palette.grey[500]
                        */
                        }
                    }>
                    <CloseIcon />
                </IconButton>
            ) : null}
        </DialogTitle>
    );
}
