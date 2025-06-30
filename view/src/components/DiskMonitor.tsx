import { Box, Typography, Button, List, ListItem, ListItemText, Breadcrumbs, Link as MuiLink } from '@mui/material';
import MetricCard from './MetricCard';
import Chart from './Chart';
import type { FC, useState } from 'react';
import React, { useState } from 'react';

// Tipos para os dados recebidos
interface DiskInfo {
    name: string;
    mountpoint: string;
    total_bytes: number;
    free_bytes: number;
    used_bytes: number;
    percent_used: number;
    read_bytes: number;
    write_bytes: number;
    transfer_bytes: number;
}

interface DiskHistoryPoint {
    time: string;
    read: number;
    write: number;
    readB: number;
    writeB: number;
}

interface FileEntry {
    name: string;
    isDir: boolean;
    size: number;
    permissions: string;
}

interface DiskMonitorProps {
    disks: DiskInfo[];
    diskHistory: Record<string, DiskHistoryPoint[]>;
    // Novos props para navegação de arquivos
    listDirectory?: (path: string) => Promise<FileEntry[]>;
}

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const DiskMonitor: FC<DiskMonitorProps> = ({ disks, diskHistory, listDirectory }) => {
    // Estado para navegação de diretórios
    const [currentPath, setCurrentPath] = useState<string | null>(null);
    const [fileEntries, setFileEntries] = useState<FileEntry[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Função para navegar para um diretório
    const handleOpenDir = async (path: string) => {
        if (!listDirectory) return;
        setLoading(true);
        setError(null);
        try {
            const files = await listDirectory(path);
            setFileEntries(files);
            setCurrentPath(path);
        } catch (e: any) {
            setError(e.message || 'Erro ao listar diretório');
        } finally {
            setLoading(false);
        }
    };

    // Função para voltar para a visualização dos discos
    const handleBackToDisks = () => {
        setCurrentPath(null);
        setFileEntries(null);
        setError(null);
    };

    // Renderização da navegação de arquivos
    if (currentPath && fileEntries) {
        return (
            <Box sx={{ width: '100%', mt: 2 }}>
                <Breadcrumbs sx={{ mb: 2 }}>
                    <MuiLink component="button" onClick={handleBackToDisks}>Discos</MuiLink>
                    {currentPath.split(/[\\/]/).filter(Boolean).map((part, idx, arr) => (
                        <MuiLink
                            key={idx}
                            component="button"
                            onClick={() => handleOpenDir(arr.slice(0, idx + 1).join('/'))}
                        >
                            {part}
                        </MuiLink>
                    ))}
                </Breadcrumbs>
                <Typography variant="h6" sx={{ mb: 2 }}>Arquivos em: {currentPath}</Typography>
                {loading && <Typography>Carregando...</Typography>}
                {error && <Typography color="error">{error}</Typography>}
                <List>
                    {fileEntries.map((entry) => (
                        <ListItem
                            key={entry.name}
                            button={entry.isDir}
                            onClick={entry.isDir ? () => handleOpenDir(currentPath + '/' + entry.name) : undefined}
                        >
                            <ListItemText
                                primary={entry.name}
                                secondary={`Tamanho: ${formatBytes(entry.size)} | Permissões: ${entry.permissions} | ${entry.isDir ? 'Diretório' : 'Arquivo'}`}
                            />
                        </ListItem>
                    ))}
                </List>
                <Button onClick={handleBackToDisks} sx={{ mt: 2 }}>Voltar aos Discos</Button>
            </Box>
        );
    }

    // Visualização dos discos
    return (
        <Box sx={{ width: '100%', mt: 2 }}>
            {disks.length === 0 && (
                <Typography variant="h6" color="text.secondary">Nenhum disco detectado.</Typography>
            )}
            {disks.map((disk) => {
                const history = diskHistory[disk.name] || [];
                const last = history[history.length - 1] || { read: 0, write: 0, readB: 0, writeB: 0 };
                const readsIn = disk.read_bytes;
                const writesOut = disk.write_bytes;
                const readsInSec = last.read;
                const writesOutSec = last.write;
                const dataRead = disk.read_bytes;
                const dataWritten = disk.write_bytes;
                const dataReadSec = last.readB;
                const dataWrittenSec = last.writeB;
                return (
                    <Box key={disk.name} sx={{ mb: 5, p: 2, border: '1px solid #eee', borderRadius: 2, background: 'background.paper' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>{disk.name} <Button size="small" onClick={() => handleOpenDir(disk.mountpoint)}>Abrir</Button></Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            <Box sx={{ minWidth: 220, flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <MetricCard title="Tamanho Total" value={formatBytes(disk.total_bytes)} small />
                                <MetricCard title="Usado" value={formatBytes(disk.used_bytes)} small />
                                <MetricCard title="Livre" value={formatBytes(disk.free_bytes)} small />
                                <MetricCard title="% Uso" value={disk.percent_used.toFixed(1) + '%'} small />
                                <MetricCard title="Reads In" value={readsIn.toLocaleString()} small />
                                <MetricCard title="Writes Out" value={writesOut.toLocaleString()} small />
                                <MetricCard title="Reads In/sec" value={readsInSec.toLocaleString()} small />
                                <MetricCard title="Writes Out/sec" value={writesOutSec.toLocaleString()} small />
                                <MetricCard title="Data Read" value={formatBytes(dataRead)} small />
                                <MetricCard title="Data Written" value={formatBytes(dataWritten)} small />
                                <MetricCard title="Data Read/sec" value={formatBytes(dataReadSec)} small />
                                <MetricCard title="Data Written/sec" value={formatBytes(dataWrittenSec)} small />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 300 }}>
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Leituras e Escritas por Segundo</Typography>
                                    <Chart
                                        type="line"
                                        color="#4F8EF7"
                                        data={history.map(h => ({ name: h.time, value: h.read }))}
                                        height={120}
                                        width="100%"
                                    />
                                    <Chart
                                        type="line"
                                        color="#7BC67E"
                                        data={history.map(h => ({ name: h.time, value: h.write }))}
                                        height={120}
                                        width="100%"
                                    />
                                </Box>
                                <Box>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Bytes Lidos e Escritos por Segundo</Typography>
                                    <Chart
                                        type="line"
                                        color="#4F8EF7"
                                        data={history.map(h => ({ name: h.time, value: h.readB }))}
                                        height={120}
                                        width="100%"
                                    />
                                    <Chart
                                        type="line"
                                        color="#7BC67E"
                                        data={history.map(h => ({ name: h.time, value: h.writeB }))}
                                        height={120}
                                        width="100%"
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};

export default DiskMonitor;
