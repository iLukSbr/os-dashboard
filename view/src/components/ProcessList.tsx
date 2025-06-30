import { useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, TableSortLabel, Button, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText } from '@mui/material';

// ====== VARIÁVEIS DE TAMANHO DE FONTE AJUSTÁVEIS ======
export const PROCESS_TITLE_FONT_SIZE = 20; // px
export const PROCESS_ROW_FONT_SIZE = 14;   // px
// ======================================================

// Define o tipo de cada processo
type ProcessInfo = {
    pid: number;
    name: string;
    cpu?: number;
    memory_kb?: number;
    // Novos campos para recursos abertos
    open_files?: FileResource[];
    open_sockets?: SocketResource[];
    open_mutexes?: MutexResource[];
};

type FileResource = {
    path: string;
    mode: string;
    size: number;
};

type SocketResource = {
    local: string;
    remote: string;
    state: string;
};

type MutexResource = {
    name: string;
    type: string;
};

// Marque as props como readonly conforme sugerido pelo SonarLint
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

    // Função para calcular o uso de memória em %
    const getMemoryPercent = (memory_kb?: number) => {
        if (!memoryTotalKb || !memory_kb) return '-';
        const percent = (memory_kb / memoryTotalKb) * 100;
        return percent.toFixed(2) + '%';
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
                                    {proc.cpu !== undefined ? proc.cpu.toString() : '-'}
                                </TableCell>
                                <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>{proc.memory_kb ?? '-'}</TableCell>
                                <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                                    {getMemoryPercent(proc.memory_kb)}
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
                <DialogTitle>Recursos do Processo PID {selectedProcess?.pid} - {selectedProcess?.name}</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>Arquivos Abertos</Typography>
                    <List dense>
                        {selectedProcess?.open_files && selectedProcess.open_files.length > 0 ? (
                            selectedProcess.open_files.map((f, idx) => (
                                <ListItem key={f.path + idx}>
                                    <ListItemText
                                        primary={f.path}
                                        secondary={`Modo: ${f.mode} | Tamanho: ${f.size} bytes`}
                                    />
                                </ListItem>
                            ))
                        ) : (
                            <ListItem><ListItemText primary="Nenhum arquivo aberto." /></ListItem>
                        )}
                    </List>
                    <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Sockets Abertos</Typography>
                    <List dense>
                        {selectedProcess?.open_sockets && selectedProcess.open_sockets.length > 0 ? (
                            selectedProcess.open_sockets.map((s, idx) => (
                                <ListItem key={s.local + s.remote + idx}>
                                    <ListItemText
                                        primary={`${s.local} ⇄ ${s.remote}`}
                                        secondary={`Estado: ${s.state}`}
                                    />
                                </ListItem>
                            ))
                        ) : (
                            <ListItem><ListItemText primary="Nenhum socket aberto." /></ListItem>
                        )}
                    </List>
                    <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Semáforos/Mutexes</Typography>
                    <List dense>
                        {selectedProcess?.open_mutexes && selectedProcess.open_mutexes.length > 0 ? (
                            selectedProcess.open_mutexes.map((m, idx) => (
                                <ListItem key={m.name + idx}>
                                    <ListItemText
                                        primary={m.name}
                                        secondary={`Tipo: ${m.type}`}
                                    />
                                </ListItem>
                            ))
                        ) : (
                            <ListItem><ListItemText primary="Nenhum semáforo/mutex aberto." /></ListItem>
                        )}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Fechar</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
