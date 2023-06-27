import { Dialog, DialogProps, TextField } from '@mui/material';
import React from 'react';

interface VerbalWebDialogProps extends DialogProps {}

export default function VerbalWebDialog(props: VerbalWebDialogProps) {
    return (
        <Dialog {...props}>
            <TextField></TextField>
        </Dialog>
    );
}
