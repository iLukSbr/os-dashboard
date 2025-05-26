// Importa componentes de gráficos da biblioteca recharts
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Define as propriedades aceitas pelo componente Chart
interface ChartProps {
    readonly type: 'line' | 'bar'; // Tipo do gráfico: linha ou barra
    readonly color: string;        // Cor da linha ou barra
    readonly data: { name?: string; value: number }[]; // Dados do gráfico
    readonly height?: number | string; // Altura do gráfico (opcional)
    readonly width?: number | string;  // Largura do gráfico (opcional)
}

// Componente Chart: exibe um gráfico de linha ou barra, conforme a prop 'type'
export default function Chart({
    type,
    color,
    data,
    height = 120,
    width = '100%',
}: ChartProps) {
    return (
        // Container responsivo para o gráfico
        <ResponsiveContainer width={width} height={height}>
            {/* Renderiza gráfico de linha ou barra conforme a prop 'type' */}
            {type === 'line' ? (
                <LineChart data={data}>
                    {/* Grid de fundo */}
                    <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />
                    {/* Eixo X oculto */}
                    <XAxis dataKey="name" hide />
                    {/* Eixo Y visível à esquerda, com escala de 0 a 100% */}
                    <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tickFormatter={v => `${v}%`}
                        width={40}
                        tick={{ fontSize: 13 }}
                    />
                    {/* Tooltip ao passar o mouse */}
                    <Tooltip formatter={v => `${v}%`} />
                    {/* Linha do gráfico */}
                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={false} />
                </LineChart>
            ) : (
                <BarChart data={data}>
                    {/* Grid de fundo */}
                    <CartesianGrid stroke="#e0e0e0" strokeDasharray="3 3" />
                    {/* Eixo X oculto */}
                    <XAxis dataKey="name" hide />
                    {/* Eixo Y visível à esquerda, com escala de 0 a 100% */}
                    <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tickFormatter={v => `${v}%`}
                        width={40}
                        tick={{ fontSize: 13 }}
                    />
                    {/* Tooltip ao passar o mouse */}
                    <Tooltip formatter={v => `${v}%`} />
                    {/* Barras do gráfico */}
                    <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
                </BarChart>
            )}
        </ResponsiveContainer>
    );
}
