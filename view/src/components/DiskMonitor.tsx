import { Box, Typography } from '@mui/material';
import MetricCard from './MetricCard';
import Chart from './Chart';
import type { FC } from 'react';

// Tipos para os dados recebidos
export interface DiskInfo {
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
}

interface DiskMonitorProps {
    disks: DiskInfo[];
    diskHistory?: Record<string, { time: string; read: number; write: number }[]>;
}

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const DiskMonitor: FC<DiskMonitorProps> = ({ disks, diskHistory }) => {
    // Função para tentar encontrar o histórico mesmo se a chave não bater exatamente
    const getHistoryForDisk = (diskName: string): { time: string; read: number; write: number }[] | undefined => {
        if (!diskHistory) return undefined;
        if (diskHistory[diskName]) return diskHistory[diskName];
        // Tenta variações comuns: sem barra, só letra, maiúsculo/minúsculo
        const altNames = [
            diskName.replace(/\\+$/, ''), // remove barra final
            diskName.toUpperCase(),
            diskName.toLowerCase(),
            diskName.replace(/\\+$/, '').toUpperCase(),
            diskName.replace(/\\+$/, '').toLowerCase(),
            diskName.endsWith(':\\') ? diskName.slice(0, 2) : undefined, // "C:\" -> "C:"
        ].filter(Boolean) as string[];
        for (const alt of altNames) {
            if (diskHistory[alt]) return diskHistory[alt];
        }
        return undefined;
    };

    // Apenas exibe as partições/discos, sem navegação de arquivos
    if (!disks || disks.length === 0) {
        return (
            <Box sx={{ width: '100%', mt: 2 }}>
                <Typography variant="h6" color="text.secondary">Nenhum disco detectado.</Typography>
            </Box>
        );
    }
    return (
        <Box sx={{ width: '100%', mt: 2 }}>
            {disks.map((disk) => {
                const percentUsed = Math.min(100, Math.max(0, disk.percent_used));
                let barColor = '#4F8EF7';
                if (percentUsed > 90) {
                    barColor = '#e53935';
                } else if (percentUsed > 70) {
                    barColor = '#fbc02d';
                }
                const textColor = percentUsed > 70 ? '#fff' : '#222';
                const history = getHistoryForDisk(disk.name);
                return (
                    <Box key={disk.name} sx={{ mb: 5, p: 2, border: '1px solid #eee', borderRadius: 2, background: 'background.paper' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>{disk.name}</Typography>
                        {/* Gráfico de histórico de leitura/escrita */}
                        {history && history.length > 1 && (
                            <Box sx={{ mb: 2 }}>
                                <Chart
                                    type="line"
                                    color={["#4F8EF7", "#e53935"]}
                                    data={history.map((h) => ({ name: h.time, Leitura: h.read, Escrita: h.write, value: h.read }))}
                                    height={120}
                                    width="100%"
                                    lines={[
                                        { key: 'Leitura', color: '#4F8EF7', name: 'Leitura (bytes/s)' },
                                        { key: 'Escrita', color: '#e53935', name: 'Escrita (bytes/s)' },
                                    ]}
                                    yLabel="Bytes/s"
                                />
                            </Box>
                        )}
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
                            <Box sx={{ flex: 1, minWidth: 180, maxWidth: 400, height: 28, background: '#eee', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                                <Box sx={{
                                    width: percentUsed + '%',
                                    height: '100%',
                                    background: barColor,
                                    transition: 'width 0.5s',
                                }} />
                                <Typography variant="body2" sx={{ position: 'absolute', left: 12, top: 2, color: textColor, fontWeight: 600 }}>
                                    {formatBytes(disk.used_bytes)} / {formatBytes(disk.total_bytes)}
                                </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ minWidth: 60, textAlign: 'right', fontWeight: 600 }}>{percentUsed.toFixed(1)}%</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            <Box sx={{ minWidth: 220, flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <MetricCard title="Tamanho Total" value={formatBytes(disk.total_bytes)} small />
                                <MetricCard title="Usado" value={formatBytes(disk.used_bytes)} small />
                                <MetricCard title="Livre" value={formatBytes(disk.free_bytes)} small />
                                <MetricCard title="% Uso" value={disk.percent_used.toFixed(1) + '%'} small />
                                <MetricCard title="Tipo" value={disk.disk_type} small />
                                <MetricCard title="FS" value={disk.file_system} small />
                                <MetricCard title="Leitura (bytes)" value={formatBytes(disk.read_bytes)} small />
                                <MetricCard title="Escrita (bytes)" value={formatBytes(disk.write_bytes)} small />
                                <MetricCard title="Transferência" value={formatBytes(disk.transfer_bytes)} small />
                                <MetricCard title="Sistema" value={disk.is_system ? 'Sim' : 'Não'} small />
                                <MetricCard title="Pagefile" value={disk.has_pagefile ? 'Sim' : 'Não'} small />
                            </Box>
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};

export default DiskMonitor;
