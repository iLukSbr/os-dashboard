import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// Define as propriedades aceitas pelo componente Chart
interface ChartProps {
    readonly type: 'line' | 'bar'; // Tipo do gráfico: linha ou barra
    readonly color: string | string[];        // Cor da linha ou barra (pode ser array para múltiplas séries)
    readonly data: { name?: string; value: number;[key: string]: any }[]; // Dados do gráfico
    readonly height?: number | string; // Altura do gráfico (opcional)
    readonly width?: number | string;  // Largura do gráfico (opcional)
    readonly yDomain?: [number, number]; // Domínio do eixo Y (opcional)
    readonly yLabel?: string; // Rótulo do eixo Y (opcional)
    readonly lines?: { key: string; color: string; name?: string }[]; // Para múltiplas linhas/barras
    readonly tooltipFormatter?: (value: any, name: string, props: any) => string | number;
    readonly yTickFormatter?: (value: any) => string | number;
}

// Componente Chart: exibe um gráfico de linha ou barra, com suporte a múltiplas séries
export default function Chart({
    type,
    color,
    data,
    height = 120,
    width = '100%',
    yDomain,
    yLabel,
    lines,
    tooltipFormatter,
    yTickFormatter,
}: ChartProps) {
    // Suporte a múltiplas linhas/barras
    const multi = Array.isArray(lines) && lines.length > 0;
    const colors = Array.isArray(color) ? color : [color];
    return (
        <ResponsiveContainer width={width} height={height}>
            {type === 'line' ? (
                <LineChart data={data}>
                    <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis
                        domain={yDomain || ['auto', 'auto']}
                        width={40}
                        tick={{ fontSize: 13 }}
                        label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 13 } : undefined}
                        tickFormatter={yTickFormatter}
                    />
                    <Tooltip formatter={tooltipFormatter} />
                    {multi
                        ? lines!.map((l, i) => (
                            <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color || colors[i % colors.length]} strokeWidth={3} dot={false} name={l.name} />
                        ))
                        : <Line type="monotone" dataKey="value" stroke={colors[0]} strokeWidth={3} dot={false} />
                    }
                    {multi && <Legend />}
                </LineChart>
            ) : (
                <BarChart data={data}>
                    <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis
                        domain={yDomain || ['auto', 'auto']}
                        width={40}
                        tick={{ fontSize: 13 }}
                        label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 13 } : undefined}
                        tickFormatter={yTickFormatter}
                    />
                    <Tooltip formatter={tooltipFormatter} />
                    {multi
                        ? lines!.map((l, i) => (
                            <Bar key={l.key} dataKey={l.key} fill={l.color || colors[i % colors.length]} radius={[6, 6, 0, 0]} name={l.name} />
                        ))
                        : <Bar dataKey="value" fill={colors[0]} radius={[6, 6, 0, 0]} />
                    }
                    {multi && <Legend />}
                </BarChart>
            )}
        </ResponsiveContainer>
    );
}
