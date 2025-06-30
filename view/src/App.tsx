import { ThemeProvider, createTheme, CssBaseline, Container } from '@mui/material';
import Dashboard from './components/Dashboard';

const darkTheme = createTheme({
    palette: {
        mode: 'dark', // Ativa modo escuro
        background: {
            default: '#1F2A44', // Cor de fundo principal
            paper: '#26304A'    // Cor de fundo dos cards/painéis
        },
        primary: { main: '#4F8EF7' } // Cor primária (azul)
    },
    shape: { borderRadius: 12 } // Bordas arredondadas nos componentes
});

// Componente principal da aplicação
function App() {
    return (
        // Aplica o tema escuro a toda a aplicação
        <ThemeProvider theme={darkTheme}>
            {/* Normaliza o CSS para o tema */}
            <CssBaseline />
            {/* Container centralizado e com padding vertical */}
            <Container maxWidth="lg" sx={{ py: 4 }}>
                {/* Renderiza o dashboard principal */}
                <Dashboard />
            </Container>
        </ThemeProvider>
    );
}

export default App;
