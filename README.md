# OS Dashboard

## Descrição
O OS Dashboard é uma aplicação web composta por um controller em Rust e um frontend em Vite + TypeScript + React. O controller coleta métricas reais do sistema Windows (CPU, memória, uptime, processos) usando as crates `sysinfo` e `windows`, além de chamadas diretas a APIs nativas do Windows via FFI (Foreign Function Interface) para obter informações detalhadas do sistema. Esses dados são expostos via API REST. O frontend exibe essas informações em tempo real.

## Informações exibidas

- Uso total de CPU (%)
- Uso de CPU por núcleo (%)
- Uso de memória total (%)
- Memória total (MB)
- Memória usada (MB)
- Memória livre (MB)
- Uptime do sistema
- Total de processos ativos
- Lista de processos ativos (PID, nome, uso de CPU, uso de memória em KB e %)
- Número de núcleos lógicos
- Clock base da CPU (MHz)

## Requisitos
- Windows 11
- [rustup](https://rustup.rs/)
- [Node.js](https://nodejs.org/pt/download)
- Chocolatey
- Em um terminal como administrador: `choco install make`

## Executar

1. Na pasta raiz do projeto: `make`

2. Ctrl + Clique com botão esquerdo do mouse no link `Local: localhost:port` que aparecer.

3. Para encerrar: `Ctrl + C`, então digite `s` e depois `Enter`
