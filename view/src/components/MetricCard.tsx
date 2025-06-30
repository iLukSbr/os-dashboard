import { Card, CardContent, Typography, Tooltip } from '@mui/material';
import React from 'react';

interface MetricCardProps {
    readonly title: string;
    readonly value?: string;
    readonly accent?: boolean;
    readonly small?: boolean;
    readonly sx?: object;
    readonly children?: React.ReactNode;
    readonly titleFontSize?: number; // px
    readonly valueFontSize?: number; // px
}

/**
 * Componente de cartão para exibir métricas do dashboard.
 */
export default function MetricCard({
    title,
    value,
    accent,
    small,
    sx,
    children,
    titleFontSize = 16,
    valueFontSize = 14,
}: MetricCardProps) {
    // Acessibilidade: id único para aria-labelledby
    const titleId = React.useId();
    const valueId = React.useId();
    const showValue = typeof value !== 'undefined' && value !== null && value !== '';

    return (
        <Card
            elevation={accent ? 8 : 6}
            tabIndex={0}
            aria-labelledby={titleId}
            aria-describedby={showValue ? valueId : undefined}
            sx={{
                mb: 3,
                background: accent ? 'primary.light' : 'background.paper',
                minWidth: small ? 0 : 250,
                p: small ? 1 : 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                border: accent ? '2px solid' : undefined,
                borderColor: accent ? 'primary.main' : undefined,
                boxShadow: accent ? 8 : 6,
                transition: 'box-shadow 0.2s, border-color 0.2s',
                outline: 'none',
                '&:focus': {
                    boxShadow: '0 0 0 3px #1976d2',
                    borderColor: 'primary.dark',
                },
                ...sx,
            }}
        >
            <CardContent sx={{ p: small ? 1 : 2, "&:last-child": { pb: small ? 1 : 2 } }}>
                <Tooltip title={title.length > 24 ? title : ''} enterDelay={400} arrow>
                    <Typography
                        id={titleId}
                        variant={small ? "caption" : "subtitle1"}
                        fontWeight="bold"
                        color="text.secondary"
                        gutterBottom
                        sx={{
                            fontSize: titleFontSize,
                            lineHeight: 1.2,
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            maxWidth: 220,
                        }}
                        tabIndex={-1}
                    >
                        {title}
                    </Typography>
                </Tooltip>
                {showValue && (
                    <Tooltip title={String(value).length > 16 ? String(value) : ''} enterDelay={400} arrow>
                        <Typography
                            id={valueId}
                            variant={small ? "h6" : "h3"}
                            fontWeight="bold"
                            color={accent ? "primary.main" : "text.primary"}
                            gutterBottom
                            sx={{
                                fontSize: valueFontSize,
                                wordBreak: 'break-all',
                                lineHeight: 1.1,
                                maxWidth: 220,
                            }}
                            tabIndex={-1}
                        >
                            {value}
                        </Typography>
                    </Tooltip>
                )}
                {children}
            </CardContent>
        </Card>
    );
}
