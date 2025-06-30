// Importa hooks do React e componentes do Material UI
import React, { useState, useEffect } from 'react';
import { Tabs, Tab, Box, Typography } from '@mui/material';
// Componente para exibir as partições do sistema
interface PartitionInfo {
    name: string; // DeviceID, ex: "Disk #0, Partition #1"
    drive_letter?: string | null; // Ex: "C:"
    total_bytes: number;
    free_bytes: number;
    used_bytes: number;
    percent_used: number;
    partition_type?: string;
    is_boot?: boolean;
    is_bootable?: boolean;
    is_primary?: boolean;
    disk_index?: number;
    starting_offset?: number;
    is_hidden?: boolean;
}

const formatPartitionBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const PartitionTable: React.FC = () => {
    const [partitions, setPartitions] = useState<PartitionInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/filesystem/partitions')
            .then(res => {
                if (!res.ok) throw new Error('Erro ao buscar partições');
                return res.json();
            })
            .then(data => {
                setPartitions(Array.isArray(data) ? data : []);
                setError(null);
            })
            .catch(() => setError('Não foi possível buscar as partições.'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ marginBottom: 16 }}>Carregando partições...</div>;
    if (error) return <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>;
    if (!partitions.length) return <div style={{ marginBottom: 16 }}>Nenhuma partição detectada.</div>;

    return (
        <Box sx={{ width: '100%', mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Partições do Sistema</Typography>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', background: 'background.paper', mb: 2 }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left', padding: 8 }}>Nome</th>
                        <th style={{ textAlign: 'left', padding: 8 }}>Letra</th>
                        <th style={{ textAlign: 'left', padding: 8 }}>Tipo</th>
                        <th style={{ textAlign: 'center', padding: 8 }}>Boot</th>
                        <th style={{ textAlign: 'center', padding: 8 }}>Primária</th>
                        <th style={{ textAlign: 'center', padding: 8 }}>Oculta</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>Tamanho Total</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>Usado</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>Livre</th>
                        <th style={{ textAlign: 'right', padding: 8 }}>% Uso</th>
                    </tr>
                </thead>
                <tbody>
                    {partitions.map(part => (
                        <tr key={part.name + (part.drive_letter ?? '')} style={{ borderBottom: '1px solid #eee', background: part.is_hidden ? '#f9f9f9' : undefined }}>
                            <td style={{ padding: 8 }}>{part.name}</td>
                            <td style={{ padding: 8 }}>{part.drive_letter ?? <span style={{ color: '#aaa' }}>-</span>}</td>
                            <td style={{ padding: 8 }}>{part.partition_type ?? <span style={{ color: '#aaa' }}>-</span>}</td>
                            <td style={{ textAlign: 'center', padding: 8 }}>{part.is_boot ? '✔️' : ''}</td>
                            <td style={{ textAlign: 'center', padding: 8 }}>{part.is_primary ? '✔️' : ''}</td>
                            <td style={{ textAlign: 'center', padding: 8 }}>
                                {part.is_hidden ? <span title="Partição Oculta" style={{ color: '#e67e22', fontWeight: 700 }}>Oculta</span> : ''}
                            </td>
                            <td style={{ textAlign: 'right', padding: 8 }}>{formatPartitionBytes(part.total_bytes)}</td>
                            <td style={{ textAlign: 'right', padding: 8 }}>{formatPartitionBytes(part.used_bytes)}</td>
                            <td style={{ textAlign: 'right', padding: 8 }}>{formatPartitionBytes(part.free_bytes)}</td>
                            <td style={{ textAlign: 'right', padding: 8 }}>{part.percent_used.toFixed(2)}%</td>
                        </tr>
                    ))}
                </tbody>
            </Box>
        </Box>
    );
};

import DiskMonitor from './DiskMonitor';
// Importa componentes customizados do projeto
import MetricCard from './MetricCard';
import Chart from './Chart';
import ProcessList from './ProcessList';

// ====== VARIÁVEIS DE TAMANHO DE FONTE AJUSTÁVEIS ======
export const CARD_TITLE_FONT_SIZE = 16; // px - Tamanho do título dos cards
export const CARD_VALUE_FONT_SIZE = 24; // px - Tamanho do valor dos cards
export const CARD_MIN_WIDTH = 140;      // px - Largura mínima dos cards
export const CARD_MIN_HEIGHT = 80;      // px - Altura mínima dos cards
export const CARD_GAP = 2;              // Espaçamento entre cards
export const TAB_FONT_SIZE = 14;        // px - Tamanho da fonte das abas
// ======================================================

// Tipagem das informações do sistema recebidas da API
export type DiskInfo = {
    name: string;
    total_bytes: number;
    free_bytes: number;
    used_bytes: number;
    percent_used: number;
    file_system: string;
    is_system: boolean;
    has_pagefile: boolean;
    disk_type: string;
    read_bytes: number;
    write_bytes: number;
    transfer_bytes: number;
};
export type SystemInfo = {
    cpu_total: string;
    cpu_per_core: number[];
    memory_total_mb: number;
    memory_used_mb: number;
    memory_free_mb: number;
    memory_percent: string;
    uptime: string;
    uptime_secs?: number;
    process_count: number;
    cpu_base_speed_mhz?: number;
    cpu_logical_processors: number;
    cpu_physical_cores?: number;
    cpu_vendor?: string;
    cpu_brand?: string;
    disks?: DiskInfo[];
    os_name?: string;
    os_version?: string;
    os_build?: string;
    hostname?: string;
    boot_time?: number;
};

// Tipagem das informações de cada processo (com recursos abertos e threads)
export type ThreadInfo = {
    tid: number;
    base_priority: number;
    delta_priority: number;
    start_address: number;
    state: string;
    wait_reason: string;
    context_switches?: number;
    user_time_ms?: number;
    kernel_time_ms?: number;
};
export type ProcessInfo = {
    pid: number;
    name: string;
    exe_path?: string;
    status: string;
    username: string;
    cpu: number;
    memory_kb: number;
    arch: string;
    description: string;
    page_faults: number;
    peak_working_set_kb: number;
    working_set_kb: number;
    pagefile_kb: number;
    io_read_bytes?: number;
    io_write_bytes?: number;
    io_read_ops?: number;
    io_write_ops?: number;
    handle_count?: number;
    thread_count?: number;
    parent_pid?: number;
    priority?: number;
    creation_time?: number;
    session_id?: number;
    command_line?: string;
    environment?: string[];
    threads: ThreadInfo[];
};

// Quantidade de pontos no histórico dos gráficos
const HISTORY_LENGTH = 60;

// Componente principal do Dashboard
export default function Dashboard() {
    // Estado da aba selecionada (0 = CPU/Memória, 1 = Processos, 2 = Disco, 3 = Diretórios)
    const [tab, setTab] = useState<number>(0);
    // Estado com informações do sistema
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    // Estado com lista de processos
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    // Histórico de uso de CPU (para o gráfico)
    const [cpuHistory, setCpuHistory] = useState<{ name: string; value: number }[]>([]);
    // Histórico de uso de memória (para o gráfico)
    const [memHistory, setMemHistory] = useState<{ name: string; value: number }[]>([]);
    // Histórico de discos (um array por disco)
    const [diskHistory, setDiskHistory] = useState<Record<string, { time: string; read: number; write: number; readB: number; writeB: number }[]>>({});

    // Todas as funções de normalização removidas. O frontend agora usa os dados do backend exatamente como recebidos (snake_case).

    useEffect(() => {
        let lastDiskStats: Record<string, { read: number; write: number; readB: number; writeB: number }> = {};
        const fetchData = () => {
            fetch('/api/system')
                .then(res => {
                    if (!res.ok) throw new Error('Erro ao buscar dados do sistema');
                    return res.json();
                })
                .then(data => {
                    setSystemInfo(data as SystemInfo);
                    setApiError(null);
                    // Atualiza histórico de CPU
                    const cpuValue = parseFloat(String(data.cpu_total));
                    setCpuHistory(prev => {
                        const next = [...prev, { name: new Date().toLocaleTimeString(), value: cpuValue }];
                        return next.length > HISTORY_LENGTH ? next.slice(-HISTORY_LENGTH) : next;
                    });
                    // Atualiza histórico de memória
                    const memValue = parseFloat(String(data.memory_percent));
                    setMemHistory(prev => {
                        const next = [...prev, { name: new Date().toLocaleTimeString(), value: memValue }];
                        return next.length > HISTORY_LENGTH ? next.slice(-HISTORY_LENGTH) : next;
                    });
                    // Atualiza histórico de disco
                    if (Array.isArray(data.disks)) {
                        const now = new Date().toLocaleTimeString();
                        const updated: typeof diskHistory = { ...diskHistory };
                        for (const disk of data.disks) {
                            if (!disk?.name || typeof disk.read_bytes !== 'number' || typeof disk.write_bytes !== 'number') continue;
                            const key = disk.name;
                            if (!updated[key]) updated[key] = [];
                            const last = lastDiskStats[key] || { read: disk.read_bytes, write: disk.write_bytes, readB: disk.read_bytes, writeB: disk.write_bytes };
                            const readDelta = Math.max(0, disk.read_bytes - last.read);
                            const writeDelta = Math.max(0, disk.write_bytes - last.write);
                            const readBDelta = Math.max(0, disk.read_bytes - last.readB);
                            const writeBDelta = Math.max(0, disk.write_bytes - last.writeB);
                            lastDiskStats[key] = { read: disk.read_bytes, write: disk.write_bytes, readB: disk.read_bytes, writeB: disk.write_bytes };
                            const arr = Array.isArray(updated[key]) ? updated[key] : [];
                            const nextArr = [...arr, { time: now, read: readDelta, write: writeDelta, readB: readBDelta, writeB: writeBDelta }];
                            updated[key] = nextArr.length > HISTORY_LENGTH ? nextArr.slice(-HISTORY_LENGTH) : nextArr;
                        }
                        setDiskHistory(updated);
                    }
                })
                .catch(() => {
                    setApiError('Não foi possível conectar ao backend ou a API retornou erro.');
                    // Não limpa o último dado válido!
                });
            fetch('/api/processes')
                .then(res => res.json())
                .then(data => setProcesses(Array.isArray(data) ? (data as ProcessInfo[]) : []))
                .catch(() => {
                    // Se a API falhar, não faz nada (mantém o último estado)
                });
        };
        fetchData();
        const interval = setInterval(fetchData, 5000); // Atualiza a cada 5 segundos conforme requisito
        return () => clearInterval(interval);
    }, []);

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
                    <Tab label="Disco" sx={{ fontSize: TAB_FONT_SIZE, fontWeight: 600 }} />
                    {/* <Tab label="Diretórios" sx={{ fontSize: TAB_FONT_SIZE, fontWeight: 600 }} /> */}
                </Tabs>
                {/* Alerta de erro persistente se a API estiver offline */}
                {apiError && (
                    <Box sx={{ mb: 2, p: 2, background: '#2d2d2d', borderRadius: 2, color: '#e53935', fontWeight: 600, fontSize: 18, textAlign: 'center' }}>
                        {apiError}
                    </Box>
                )}
                {/* Conteúdo da aba Memória & CPU */}
                {tab === 0 && (
                    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                        {!systemInfo ? (
                            <span style={{ color: '#888', fontSize: 22 }}>Carregando dados do sistema...</span>
                        ) : (
                            <>
                                {/* Cartão de uso total de CPU com gráfico de linha */}
                                <MetricCard
                                    title="Uso Total de CPU"
                                    value={systemInfo.cpu_total}
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
                                    value={systemInfo.memory_percent}
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
                                    <MetricCard title="Memória Total" value={`${systemInfo.memory_total_mb} MB`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                                    <MetricCard title="Memória Usada" value={`${systemInfo.memory_used_mb} MB`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                                    <MetricCard title="Memória Livre" value={`${systemInfo.memory_free_mb} MB`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                                    <MetricCard title="Total de Processos" value={`${systemInfo.process_count}`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                                    <MetricCard title="Núcleos Lógicos" value={`${systemInfo.cpu_logical_processors}`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
                                    <MetricCard title="Clock Base CPU" value={`${systemInfo.cpu_base_speed_mhz ?? '-'} MHz`} small titleFontSize={CARD_TITLE_FONT_SIZE} valueFontSize={CARD_VALUE_FONT_SIZE} sx={{ fontSize: CARD_VALUE_FONT_SIZE, minWidth: CARD_MIN_WIDTH, minHeight: CARD_MIN_HEIGHT }} />
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
                                    {systemInfo.cpu_per_core.map((core, idx) => (
                                        <MetricCard
                                            key={systemInfo.hostname ? `core-${systemInfo.hostname}-${idx}` : `core-${idx}`}
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
                            </>
                        )}
                    </Box>
                )}
                {/* Aba de Processos */}
                {tab === 1 && (
                    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <ProcessList processes={processes} memoryTotalKb={systemInfo?.memory_total_mb ? systemInfo.memory_total_mb * 1024 : undefined} />
                    </Box>
                )}
                {/* Aba de Disco */}
                {tab === 2 && (
                    <>
                        <PartitionTable />
                        <DiskMonitor
                            disks={Array.isArray(systemInfo?.disks) ? systemInfo.disks.filter(disk => disk && typeof disk === 'object' && disk.name) : []}
                            diskHistory={diskHistory}
                        />
                    </>
                )}
                {/* Diretórios removido: navegação será feita por GUI local */}
            </Box>
        </Box>
    );
}
