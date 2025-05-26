import { useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, TableSortLabel } from '@mui/material';

// ====== VARIÁVEIS DE TAMANHO DE FONTE AJUSTÁVEIS ======
export const PROCESS_TITLE_FONT_SIZE = 35; // px
export const PROCESS_ROW_FONT_SIZE = 24;   // px
// ======================================================

// Define o tipo de cada processo
type ProcessInfo = {
    pid: number;
    name: string;
    cpu?: number;
    memory_kb?: number;
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

// Componente principal da lista de processos
export default function ProcessList({ processes, memoryTotalKb }: ProcessListProps) {
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<OrderBy>('pid');

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

    return (
        <TableContainer component={Paper} sx={{ background: 'background.paper', mt: 2 }}>
            {/* Título da tabela */}
            <Typography
                variant="h6"
                fontWeight="bold"
                color="primary"
                sx={{ p: 2, fontSize: PROCESS_TITLE_FONT_SIZE }}
            >
                Processos Ativos
            </Typography>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell sortDirection={orderBy === 'pid' ? order : false} sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                            <TableSortLabel
                                active={orderBy === 'pid'}
                                direction={orderBy === 'pid' ? order : 'asc'}
                                onClick={() => handleSort('pid')}
                            >
                                PID
                            </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={orderBy === 'name' ? order : false} sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                            <TableSortLabel
                                active={orderBy === 'name'}
                                direction={orderBy === 'name' ? order : 'asc'}
                                onClick={() => handleSort('name')}
                            >
                                Processo
                            </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={orderBy === 'cpu' ? order : false} sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                            <TableSortLabel
                                active={orderBy === 'cpu'}
                                direction={orderBy === 'cpu' ? order : 'asc'}
                                onClick={() => handleSort('cpu')}
                            >
                                CPU (%)
                            </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={orderBy === 'memory_kb' ? order : false} sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                            <TableSortLabel
                                active={orderBy === 'memory_kb'}
                                direction={orderBy === 'memory_kb' ? order : 'asc'}
                                onClick={() => handleSort('memory_kb')}
                            >
                                Memória (KB)
                            </TableSortLabel>
                        </TableCell>
                        <TableCell sortDirection={orderBy === 'memory_percent' ? order : false} sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                            <TableSortLabel
                                active={orderBy === 'memory_percent'}
                                direction={orderBy === 'memory_percent' ? order : 'asc'}
                                onClick={() => handleSort('memory_percent')}
                            >
                                % Memória
                            </TableSortLabel>
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sortedProcesses.map(proc => (
                        <TableRow key={proc.pid}>
                            <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>{proc.pid}</TableCell>
                            <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>{proc.name}</TableCell>
                            <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                                {proc.cpu !== undefined ? proc.cpu.toString() : '-'}
                            </TableCell>
                            <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>{proc.memory_kb ?? '-'}</TableCell>
                            <TableCell sx={{ fontSize: PROCESS_ROW_FONT_SIZE }}>
                                {getMemoryPercent(proc.memory_kb)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
