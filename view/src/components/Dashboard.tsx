// Importa hooks do React e componentes do Material UI
import { useState, useEffect } from 'react';
import { Tabs, Tab, Box } from '@mui/material';
// Importa componentes customizados do projeto
import MetricCard from './MetricCard';
import Chart from './Chart';
import ProcessList from './ProcessList';

// ====== VARIÁVEIS DE TAMANHO DE FONTE AJUSTÁVEIS ======
export const CARD_TITLE_FONT_SIZE = 20; // px - Tamanho do título dos cards
export const CARD_VALUE_FONT_SIZE = 35; // px - Tamanho do valor dos cards
export const CARD_MIN_WIDTH = 140;      // px - Largura mínima dos cards
export const CARD_MIN_HEIGHT = 80;      // px - Altura mínima dos cards
export const CARD_GAP = 2;              // Espaçamento entre cards
export const TAB_FONT_SIZE = 20;        // px - Tamanho da fonte das abas
// ======================================================

// Tipagem das informações do sistema recebidas da API
type SystemInfo = {
    cpuTotal: string;
    cpuPerCore: number[];
    memoryTotalMb: number;
    memoryUsedMb: number;
    memoryFreeMb: number;
    memoryPercent: string;
    uptime: string;
    processCount: number;
    cpuBaseSpeedMhz?: number;
    cpuLogicalProcessors: number;
};

// Tipagem das informações de cada processo
type ProcessInfo = {
    pid: number;
    name: string;
    cpu?: number;
    memory_kb?: number;
};

// Quantidade de pontos no histórico dos gráficos (ex: 60 segundos)
const HISTORY_LENGTH = 60;

// Componente principal do Dashboard
export default function Dashboard() {
    // Estado da aba selecionada (0 = CPU/Memória, 1 = Processos)
    const [tab, setTab] = useState<number>(0);
    // Estado com informações do sistema
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    // Estado com lista de processos
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    // Histórico de uso de CPU (para o gráfico)
    const [cpuHistory, setCpuHistory] = useState<{ name: string; value: number }[]>([]);
    // Histórico de uso de memória (para o gráfico)
    const [memHistory, setMemHistory] = useState<{ name: string; value: number }[]>([]);

    // Efeito para buscar dados do sistema periodicamente
    useEffect(() => {
        // Função que busca dados da API
        const fetchData = () => {
            // Busca informações do sistema
            fetch('/api/system')
                .then(res => res.json())
                .then(data => {
                    setSystemInfo(data);
                    // Atualiza histórico de CPU
                    setCpuHistory(prev => {
                        const next = [
                            ...prev,
                            { name: new Date().toLocaleTimeString(), value: parseFloat(data.cpuTotal) }
                        ];
                        return next.length > HISTORY_LENGTH ? next.slice(-HISTORY_LENGTH) : next;
                    });
                    // Atualiza histórico de memória
                    setMemHistory(prev => {
                        const next = [
                            ...prev,
                            { name: new Date().toLocaleTimeString(), value: parseFloat(data.memoryPercent) }
                        ];
                        return next.length > HISTORY_LENGTH ? next.slice(-HISTORY_LENGTH) : next;
                    });
                });
            // Busca lista de processos
            fetch('/api/processes')
                .then(res => res.json())
                .then(setProcesses);
        };

        // Executa a primeira busca imediatamente
        fetchData();
        // Atualiza a cada 1 segundo
        const interval = setInterval(fetchData, 1000);
        // Limpa o intervalo ao desmontar o componente
        return () => clearInterval(interval);
    }, []);

    // Renderização do componente
    return (
        <Box
            sx={{
                width: '100vw',
                minHeight: '100vh',
                minWidth: '100vw',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                p: 0,
                m: 0,
                boxSizing: 'border-box',
                background: 'background.default',
            }}
        >
            <Box
                sx={{
                    width: '100%',
                    px: { xs: 3, sm: 6, md: 10, lg: 16 },
                    maxWidth: '100vw',
                    boxSizing: 'border-box',
                }}
            >
                {/* Abas para alternar entre CPU/Memória e Processos */}
                <Tabs
                    value={tab}
                    onChange={(_e, v) => setTab(v)}
                    textColor="primary"
                    indicatorColor="primary"
                    sx={{ mb: 3, maxWidth: '100vw' }}
                >
                    <Tab label="Memória & CPU" sx={{ fontSize: TAB_FONT_SIZE, fontWeight: 600 }} />
                    <Tab label="Processos" sx={{ fontSize: TAB_FONT_SIZE, fontWeight: 600 }} />
                </Tabs>
                {/* Conteúdo da aba Memória & CPU */}
                {tab === 0 && systemInfo && (
                    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                        {/* Cartão de uso total de CPU com gráfico de linha */}
                        <MetricCard
                            title="Uso Total de CPU"
                            value={systemInfo.cpuTotal}
                            accent
                            titleFontSize={CARD_TITLE_FONT_SIZE}
                            valueFontSize={CARD_VALUE_FONT_SIZE}
                            sx={{ width: '100%', mb: 2 }}
                        >
                            <Chart
                                type="line"
                                color="#4F8EF7"
                                data={cpuHistory}
                                height={320}
                                width="100%"
                            />
                        </MetricCard>
                        {/* Cartão de uso de memória com gráfico de linha */}
                        <MetricCard
                            title="Uso de Memória (%)"
                            value={systemInfo.memoryPercent}
                            accent
                            titleFontSize={CARD_TITLE_FONT_SIZE}
                            valueFontSize={CARD_VALUE_FONT_SIZE}
                            sx={{ width: '100%', mb: 2 }}
                        >
                            <Chart
                                type="line"
                                color="#7BC67E"
                                data={memHistory}
                                height={320}
                                width="100%"
                            />
                        </MetricCard>
                        {/* Cartões de info e uptime juntos, ocupando toda a largura e quebrando se necessário */}
                        <Box
                            sx={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: CARD_GAP,
                                justifyContent: 'center',
                                alignItems: 'stretch',
                                mb: 3,
                                width: '100%',
                            }}
                        >
                            <MetricCard title="Uptime" value={systemInfo.uptime} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                            <MetricCard title="Memória Total" value={`${systemInfo.memoryTotalMb} MB`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                            <MetricCard title="Memória Usada" value={`${systemInfo.memoryUsedMb} MB`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                            <MetricCard title="Memória Livre" value={`${systemInfo.memoryFreeMb} MB`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                            <MetricCard title="Total de Processos" value={`${systemInfo.processCount}`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                            <MetricCard title="Núcleos Lógicos" value={`${systemInfo.cpuLogicalProcessors}`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                            <MetricCard title="Clock Base CPU" value={`${systemInfo.cpuBaseSpeedMhz ?? '-'} MHz`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                        </Box>
                        {/* Cartões para cada núcleo de CPU */}
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 2,
                            mt: 2,
                            mb: 3,
                            width: '100%',
                            maxWidth: '100vw',
                            px: { xs: 0, md: 2 },
                            justifyContent: 'center',
                        }}>
                            {systemInfo.cpuPerCore.map((core, idx) => (
                                <MetricCard
                                    key={idx}
                                    title={`Core ${idx + 1}`}
                                    value={`${core.toFixed(1)}%`}
                                    small
                                    titleFontSize={CARD_TITLE_FONT_SIZE}
                                    valueFontSize={CARD_VALUE_FONT_SIZE}
                                    sx={{ minWidth: 0, p: 2, fontSize: CARD_VALUE_FONT_SIZE }}
                                >
                                    <Chart
                                        type="bar"
                                        color="#4F8EF7"
                                        data={[{ value: core }]}
                                        height={340}
                                        width="100%"
                                    />
                                </MetricCard>
                            ))}
                        </Box>
                    </Box>
                )}
                {/* Aba de Processos */}
                {tab === 1 && (
                    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <ProcessList processes={processes} memoryTotalKb={systemInfo?.memoryTotalMb ? systemInfo.memoryTotalMb * 1024 : undefined} />
                    </Box>
                )}
            </Box>
        </Box>
    );
}
