import { Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface MetricCardProps {
    readonly title: string;
    readonly value?: string;
    readonly accent?: boolean;
    readonly small?: boolean;
    readonly sx?: object;
    readonly children?: ReactNode;
    readonly titleFontSize?: number; // px
    readonly valueFontSize?: number; // px
}

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
    return (
        <Card
            elevation={6}
            sx={{
                mb: 3,
                background: 'background.paper',
                minWidth: small ? 0 : 250,
                p: small ? 1 : 2,
                ...sx,
            }}
        >
            <CardContent sx={{ p: small ? 1 : 2, "&:last-child": { pb: small ? 1 : 2 } }}>
                <Typography
                    variant={small ? "caption" : "subtitle1"}
                    fontWeight="bold"
                    color="text.secondary"
                    gutterBottom
                    sx={{
                        fontSize: titleFontSize,
                        lineHeight: 1.2,
                    }}
                >
                    {title}
                </Typography>
                {typeof value !== 'undefined' && value !== null && value !== '' && (
                    <Typography
                        variant={small ? "h6" : "h3"}
                        fontWeight="bold"
                        color={accent ? "primary" : "text.primary"}
                        gutterBottom
                        sx={{
                            fontSize: valueFontSize,
                        }}
                    >
                        {value}
                    </Typography>
                )}
                {children}
            </CardContent>
        </Card>
    );
}
// Importa componentes do Material UI para criar o card e tipagem do React
import { Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';


// --- CÓDIGO DUPLICADO REMOVIDO ---
