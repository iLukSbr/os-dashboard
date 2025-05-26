// Importa componentes do Material UI para criar o card e tipagem do React
import { Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';

// Interface que define as propriedades aceitas pelo MetricCard
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

// Componente principal MetricCard
export default function MetricCard({
    title,
    value,
    accent,
    small,
    sx,
    children,
    titleFontSize = 16, // valor padrão para o tamanho do título
    valueFontSize = 14, // valor padrão para o tamanho do valor
}: MetricCardProps) {
    return (
        // Card principal com sombra e cor de fundo
        <Card
            elevation={6}
            sx={{
                mb: 3, // margem inferior
                background: 'background.paper', // cor de fundo do tema
                minWidth: small ? 0 : 250, // largura mínima
                p: small ? 1 : 2, // padding
                ...sx, // estilos adicionais
            }}
        >
            {/* Conteúdo do card */}
            <CardContent sx={{ p: small ? 1 : 2, "&:last-child": { pb: small ? 1 : 2 } }}>
                {/* Título do card com tamanho ajustável */}
                <Typography
                    variant={small ? "caption" : "subtitle1"}
                    fontWeight="bold"
                    color="text.secondary"
                    gutterBottom
                    sx={{
                        fontSize: titleFontSize, // tamanho da fonte do título
                        lineHeight: 1.2,
                    }}
                >
                    {title}
                </Typography>
                {/* Valor principal, se fornecido, com tamanho ajustável */}
                {value && (
                    <Typography
                        variant={small ? "h6" : "h3"}
                        fontWeight="bold"
                        color={accent ? "primary" : "text.primary"}
                        gutterBottom
                        sx={{
                            fontSize: valueFontSize, // tamanho da fonte do valor
                        }}
                    >
                        {value}
                    </Typography>
                )}
                {/* Conteúdo extra, como gráficos */}
                {children}
            </CardContent>
        </Card>
    );
}
