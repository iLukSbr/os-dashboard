import { useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, TableSortLabel, Button, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText } from '@mui/material';

// ====== VARIÁVEIS DE TAMANHO DE FONTE AJUSTÁVEIS ======
export const PROCESS_TITLE_FONT_SIZE = 20; // px
export const PROCESS_ROW_FONT_SIZE = 14;   // px
// ======================================================

// Tipagem fiel ao backend
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
    open_resources?: string[];
    memory_percent?: number;
};

type ProcessListProps = {
    readonly processes: ProcessInfo[];
    readonly memoryTotalKb?: number;
};

type Order = 'asc' | 'desc';
type OrderBy = keyof ProcessInfo | 'memory_percent';

// Função para comparar dois itens para ordenação decrescente
function descendingComparator(
    a: ProcessInfo,
    b: ProcessInfo,
    orderBy: OrderBy,
    memoryTotalKb?: number
) {
    if (orderBy === 'memory_percent') {
        const percentA = a.memory_kb && memoryTotalKb ? a.memory_kb / memoryTotalKb : 0;
        const percentB = b.memory_kb && memoryTotalKb ? b.memory_kb / memoryTotalKb : 0;
        return percentB - percentA;
    }
    if (a[orderBy as keyof ProcessInfo] === undefined) return 1;
    if (b[orderBy as keyof ProcessInfo] === undefined) return -1;
    if (
        typeof a[orderBy as keyof ProcessInfo] === 'number' &&
        typeof b[orderBy as keyof ProcessInfo] === 'number'
    ) {
        return (b[orderBy as keyof ProcessInfo] as number) - (a[orderBy as keyof ProcessInfo] as number);
    }
    if (
        typeof a[orderBy as keyof ProcessInfo] === 'string' &&
        typeof b[orderBy as keyof ProcessInfo] === 'string'
    ) {
        return (b[orderBy as keyof ProcessInfo] as string).localeCompare(
            a[orderBy as keyof ProcessInfo] as string
        );
    }
    return 0;
}

// Retorna a função de comparação de acordo com a ordem (asc/desc)
function getComparator(
    order: Order,
    orderBy: OrderBy,
    memoryTotalKb?: number
): (a: ProcessInfo, b: ProcessInfo) => number {
    return order === 'desc'
        ? (a, b) => descendingComparator(a, b, orderBy, memoryTotalKb)
        : (a, b) => -descendingComparator(a, b, orderBy, memoryTotalKb);
}

export default function ProcessList({ processes, memoryTotalKb }: ProcessListProps) {
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<OrderBy>('pid');
    const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    // Função chamada ao clicar para ordenar uma coluna
    const handleSort = (property: OrderBy) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    // Ordena os processos conforme o estado atual
    const sortedProcesses = [...processes].sort(getComparator(order, orderBy, memoryTotalKb));

    // Função para obter o uso de memória em % (usa apenas o valor do backend, sem cálculo)
    const getMemoryPercent = (proc: any) => {
        // Mostra exatamente o valor vindo do backend, mesmo se for 0
        if (Object.prototype.hasOwnProperty.call(proc, 'memory_percent')) {
            const val = proc.memory_percent;
            if (val === 0) return '0.00%';
            if (typeof val === 'number' && !isNaN(val)) return val.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + '%';
            if (typeof val === 'string' && val !== '') {
                const num = parseFloat(val);
                if (!isNaN(num)) return num.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + '%';
            }
        }
        if (Object.prototype.hasOwnProperty.call(proc, 'memoryPercent')) {
            const val = proc.memoryPercent;
            if (val === 0) return '0.00%';
            if (typeof val === 'number' && !isNaN(val)) return val.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + '%';
            if (typeof val === 'string' && val !== '') {
                const num = parseFloat(val);
                if (!isNaN(num)) return num.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + '%';
            }
        }
        return '-';
    };

    // Função para abrir detalhes do processo
    const handleOpenDetails = (proc: ProcessInfo) => {
        setSelectedProcess(proc);
        setDialogOpen(true);
    };
    const handleCloseDialog = () => {
        setDialogOpen(false);
        setSelectedProcess(null);
    };

    return (
        <>
            <TableContainer
                component={Paper}
                sx={{
                    background: 'background.paper',
                    mt: 2,
                    maxHeight: 500,
                    overflowY: 'auto'
                }}
            >
                {/* Título da tabela */}
                <Typography
                    variant="h6"
                    fontWeight="bold"
                    color="primary"
                    sx={{ p: 2, fontSize: PROCESS_TITLE_FONT_SIZE }}
                >
                    Processos Ativos
                </Typography>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell
                                sortDirection={orderBy === 'pid' ? order : false}
                                sx={{ fontSize: PROCESS_ROW_FONT_SIZE, minWidth: 60, maxWidth: 80, width: 70 }}
                            >
                                <TableSortLabel
                                    active={orderBy === 'pid'}
                                    direction={orderBy === 'pid' ? order : 'asc'}
                                    onClick={() => handleSort('pid')}
                                >
                                    PID
                                </TableSortLabel>
                            </TableCell>
                            <TableCell
                                sortDirection={orderBy === 'name' ? order : false}
                                sx={{
                                    fontSize: PROCESS_ROW_FONT_SIZE,
                                    minWidth: 120,
                                    maxWidth: 220,
                                    width: 180,
                                    wordBreak: 'break-all',
                                    whiteSpace: 'normal'
                                }}
                            >
                                <TableSortLabel
                                    active={orderBy === 'name'}
                                    direction={orderBy === 'name' ? order : 'asc'}
                                    onClick={() => handleSort('name')}
                                >
                                    Processo
                                </TableSortLabel>
                            </TableCell>
                            <TableCell
                                sortDirection={orderBy === 'cpu' ? order : false}
                                sx={{ fontSize: PROCESS_ROW_FONT_SIZE, minWidth: 70, maxWidth: 90, width: 80 }}
                            >
                                <TableSortLabel
                                    active={orderBy === 'cpu'}
                                    direction={orderBy === 'cpu' ? order : 'asc'}
                                    onClick={() => handleSort('cpu')}
                                >
                                    CPU (%)
                                </TableSortLabel>
                            </TableCell>
                            <TableCell
                                sortDirection={orderBy === 'memory_kb' ? order : false}
                                sx={{ fontSize: PROCESS_ROW_FONT_SIZE, minWidth: 90, maxWidth: 110, width: 100 }}
                            >
                                <TableSortLabel
                                    active={orderBy === 'memory_kb'}
                                    direction={orderBy === 'memory_kb' ? order : 'asc'}
                                    onClick={() => handleSort('memory_kb')}
                                >
                                    Memória (KB)
                                </TableSortLabel>
                            </TableCell>
                            <TableCell
                                sortDirection={orderBy === 'memory_percent' ? order : false}
                                sx={{ fontSize: PROCESS_ROW_FONT_SIZE, minWidth: 90, maxWidth: 110, width: 100 }}
                            >
                                <TableSortLabel
                                    active={orderBy === 'memory_percent'}
                                    direction={orderBy === 'memory_percent' ? order : 'asc'}
                                    onClick={() => handleSort('memory_percent')}
                                >
                                    % Memória
                                </TableSortLabel>
                            </TableCell>
                            <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE, minWidth: 80 }}>Detalhes</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedProcesses.map(proc => (
                            <TableRow key={proc.pid}>
                                <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>{proc.pid}</TableCell>
                                <TableCell
                                    sx={{
                                        fontSize: PROCESS_ROW_FONT_SIZE,
                                        wordBreak: 'break-all',
                                        whiteSpace: 'normal'
                                    }}
                                >
                                    {proc.name}
                                </TableCell>
                                <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                                    {typeof proc.cpu === 'number' && !isNaN(proc.cpu) ? proc.cpu : 0}
                                </TableCell>
                                <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                                    {typeof proc.memory_kb === 'number' && !isNaN(proc.memory_kb) ? proc.memory_kb : 0}
                                </TableCell>
                                <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                                    {getMemoryPercent(proc)}
                                </TableCell>
                                <TableCell>
                                    <Button size="small" onClick={() => handleOpenDetails(proc)}>
                                        Ver Recursos
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Diálogo de detalhes do processo */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
                <DialogTitle>Detalhes do Processo PID {selectedProcess?.pid} - {selectedProcess?.name}</DialogTitle>
                <DialogContent dividers>
                    {selectedProcess && (
                        <>
                            <Typography variant="subtitle1" sx={{ mb: 1 }}>Informações Gerais</Typography>
                            <List dense>
                                <ListItem><ListItemText primary="Usuário" secondary={selectedProcess.username ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Status" secondary={selectedProcess.status ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Arquitetura" secondary={selectedProcess.arch ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Descrição" secondary={selectedProcess.description ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Linha de comando" secondary={selectedProcess.command_line && selectedProcess.command_line !== '' ? selectedProcess.command_line : '-'} /></ListItem>
                                <ListItem><ListItemText primary="PID Pai" secondary={selectedProcess.parent_pid ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Prioridade" secondary={selectedProcess.priority ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Sessão" secondary={selectedProcess.session_id ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Handles abertos" secondary={selectedProcess.handle_count ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Threads" secondary={selectedProcess.thread_count ?? selectedProcess.threads.length} /></ListItem>
                                <ListItem><ListItemText primary="Page Faults" secondary={selectedProcess.page_faults ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Peak Working Set (KB)" secondary={selectedProcess.peak_working_set_kb ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="Working Set (KB)" secondary={typeof selectedProcess.working_set_kb === 'number' && !isNaN(selectedProcess.working_set_kb) ? selectedProcess.working_set_kb : (selectedProcess.working_set_kb === 0 ? 0 : '-')} /></ListItem>
                                <ListItem><ListItemText primary="Pagefile (KB)" secondary={selectedProcess.pagefile_kb ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="% Memória" secondary={getMemoryPercent(selectedProcess)} /></ListItem>
                                <ListItem><ListItemText primary="IO Read (bytes)" secondary={selectedProcess.io_read_bytes ?? '-'} /></ListItem>
                                <ListItem><ListItemText primary="IO Write (bytes)" secondary={selectedProcess.io_write_bytes ?? '-'} /></ListItem>
                            </List>
                            <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Recursos Abertos / Arquivos</Typography>
                            <List dense>
                                {Array.isArray(selectedProcess.open_resources) && selectedProcess.open_resources.length > 0 ? (
                                    selectedProcess.open_resources.map((path, idx) => (
                                        <ListItem key={idx}>
                                            <ListItemText primary={path} />
                                        </ListItem>
                                    ))
                                ) : (
                                    <ListItem><ListItemText primary="Nenhum recurso aberto listado." /></ListItem>
                                )}
                            </List>
                            <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Threads</Typography>
                            <List dense>
                                {selectedProcess.threads.length > 0 ? (
                                    selectedProcess.threads.map((t) => (
                                        <ListItem key={t.tid}>
                                            <ListItemText
                                                primary={`TID: ${t.tid} | Estado: ${t.state} | Wait: ${t.wait_reason}`}
                                                secondary={`BasePrio: ${t.base_priority} | DeltaPrio: ${t.delta_priority} | StartAddr: 0x${t.start_address.toString(16)} | User(ms): ${t.user_time_ms ?? '-'} | Kernel(ms): ${t.kernel_time_ms ?? '-'}`}
                                            />
                                        </ListItem>
                                    ))
                                ) : (
                                    <ListItem><ListItemText primary="Nenhuma thread encontrada." /></ListItem>
                                )}
                            </List>
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Fechar</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
