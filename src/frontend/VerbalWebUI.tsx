import VerbalWebDialog from './VerbalWebDialog';
import AssistantIcon from '@mui/icons-material/Assistant';
import { Box, IconButton, Tooltip } from '@mui/material';
import React, { useState } from 'react';

export default function VerbalWebUI() {
    const [open, setOpen] = useState(false);
    return (
        <Box>
            <Tooltip title="Verbal Web AI assistant">
                <IconButton
                    color="primary"
                    size="large"
                    onClick={() => {
                        setOpen(true);
                    }}>
                    <AssistantIcon />
                </IconButton>
            </Tooltip>
            <VerbalWebDialog
                open={open}
                onClose={() => {
                    setOpen(false);
                }}
            />
        </Box>
    );
}
