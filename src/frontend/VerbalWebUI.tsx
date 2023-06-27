import VerbalWebDialog from './VerbalWebDialog';
import AssistantIcon from '@mui/icons-material/Assistant';
import { Box, IconButton } from '@mui/material';
import React, { useState } from 'react';

export default function VerbalWebUI() {
    const [open, setOpen] = useState(false);
    return (
        <Box>
            <IconButton
                color="primary"
                onClick={() => {
                    setOpen(true);
                }}>
                <AssistantIcon />
            </IconButton>
            <VerbalWebDialog
                open={open}
                onClose={() => {
                    setOpen(false);
                }}
            />
        </Box>
    );
}
