// Importa módulos e crates necessários
use axum::{routing::get, Router, Json}; // Axum para rotas HTTP e JSON
use serde::Serialize; // Para serializar structs em JSON
use std::collections::HashMap; // Mapa para associar PID ao uso de CPU
use std::ffi::OsString; // Para manipular strings do Windows
use std::mem::size_of; // Para obter tamanho de structs
use std::os::windows::ffi::OsStringExt; // Para converter strings do Windows
use std::ptr::null_mut; // Para ponteiros nulos
use tokio::task; // Para executar tarefas bloqueantes em threads separadas
use sysinfo::System; // Para obter informações do sistema

// --- FFI das APIs do Windows ---
// Liga funções da API do Windows para uso direto em Rust
#[link(name = "kernel32")] // Acessar a DLL
extern "system" {
    fn GetTickCount64() -> u64; // Retorna uptime do sistema em ms
    fn GlobalMemoryStatusEx(lpBuffer: *mut MEMORYSTATUSEX) -> i32; // Preenche struct com info de memória
    fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut std::ffi::c_void; // Abre processo
    fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32; // Fecha handle de processo
}
#[link(name = "psapi")] // Acessar a DLL
extern "system" {
    fn GetProcessMemoryInfo(
        Process: *mut std::ffi::c_void,
        ppsmemCounters: *mut PROCESS_MEMORY_COUNTERS,
        cb: u32,
    ) -> i32; // Retorna info de memória de um processo
    fn EnumProcesses(lpidProcess: *mut u32, cb: u32, lpcbNeeded: *mut u32) -> i32; // Enumera PIDs
    fn GetModuleBaseNameW(
        hProcess: *mut std::ffi::c_void,
        hModule: *mut std::ffi::c_void,
        lpBaseName: *mut u16,
        nSize: u32,
    ) -> u32; // Retorna nome do executável do processo
}

// --- Structs FFI ---
// Struct igual à da API do Windows para uso em FFI
#[allow(non_snake_case)]
#[repr(C)]
struct PROCESS_MEMORY_COUNTERS {
    cb: u32, // Tamanho da struct
    PageFaultCount: u32, // Número de page faults
    PeakWorkingSetSize: usize, // Pico de uso de memória física
    WorkingSetSize: usize, // Uso atual de memória física
    QuotaPeakPagedPoolUsage: usize, // Pico de uso de pool paginado
    QuotaPagedPoolUsage: usize, // Uso atual de pool paginado
    QuotaPeakNonPagedPoolUsage: usize, // Pico de uso de pool não paginado
    QuotaNonPagedPoolUsage: usize, // Uso atual de pool não paginado
    PagefileUsage: usize, // Uso atual de arquivo de paginação
    PeakPagefileUsage: usize, // Pico de uso de arquivo de paginação
}

// Struct igual à da API do Windows para uso em FFI
#[allow(non_snake_case)]
#[repr(C)]
struct MEMORYSTATUSEX {
    dwLength: u32, // Tamanho da struct
    dwMemoryLoad: u32, // Porcentagem de uso de memória
    ullTotalPhys: u64, // Total de memória física
    ullAvailPhys: u64, // Memória física disponível
    ullTotalPageFile: u64, // Total de arquivo de paginação
    ullAvailPageFile: u64, // Arquivo de paginação disponível
    ullTotalVirtual: u64, // Total de memória virtual
    ullAvailVirtual: u64, // Memória virtual disponível
    ullAvailExtendedVirtual: u64, // Memória virtual estendida disponível (não usada)
}

// --- Constantes ---
const PROCESS_QUERY_INFORMATION: u32 = 0x0400; // Permissão para consultar info do processo
const PROCESS_VM_READ: u32 = 0x0010; // Permissão para ler memória do processo
const MAX_PROCESSES: usize = 1024; // Máximo de processos a listar

// --- Structs de resposta ---
// Struct para resposta de cada processo
#[derive(Serialize)]
struct ProcessInfo {
    pid: u32,        // ID do processo
    name: String,    // Nome do executável
    memory_kb: u64,  // Memória usada em KB
    cpu: f32,        // Uso de CPU (%)
}

// Struct para resposta de informações do sistema
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    cpu_total: String,           // Uso total de CPU (%)
    cpu_per_core: Vec<f32>,      // Uso de CPU por core (%)
    memory_total_mb: u64,        // Memória total (MB)
    memory_used_mb: u64,         // Memória usada (MB)
    memory_free_mb: u64,         // Memória livre (MB)
    memory_percent: String,      // Uso de memória (%)
    uptime: String,              // Uptime formatado
    process_count: usize,        // Total de processos
    cpu_base_speed_mhz: Option<u64>, // Clock base (primeiro core)
    cpu_logical_processors: u32,     // Núcleos lógicos
}

// --- Lista de processos via FFI + uso de CPU via sysinfo ---
async fn list_processes() -> Json<Vec<ProcessInfo>> {
    // Executa em thread separada para não travar o servidor
    let processes = task::spawn_blocking(|| {
        let mut sys = System::new_all(); // Cria struct do sysinfo
        sys.refresh_all(); // Atualiza info do sistema
        std::thread::sleep(std::time::Duration::from_millis(1000)); // Espera para medir CPU
        sys.refresh_all(); // Atualiza novamente

        let mut cpu_map: HashMap<u32, f32> = HashMap::new(); // Mapa de PID para uso de CPU
        for (pid, proc_) in sys.processes() {
            cpu_map.insert(pid.as_u32(), proc_.cpu_usage()); // Preenche mapa
        }

        let mut result = Vec::new(); // Vetor de processos
        unsafe {
            let mut pids = [0u32; MAX_PROCESSES]; // Buffer para PIDs
            let mut needed = 0u32; // Quantidade de bytes usados no buffer
            if EnumProcesses(pids.as_mut_ptr(), (MAX_PROCESSES * 4) as u32, &mut needed) == 0 {
                return result; // Se falhar, retorna vazio
            }
            let count = needed as usize / 4; // Número de PIDs retornados
            for &pid in &pids[..count] {
                if pid == 0 {
                    continue; // Ignora PID 0
                }
                let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid); // Abre processo
                if handle.is_null() {
                    continue; // Se não conseguir abrir, ignora
                }
                let mut name_buf = [0u16; 260]; // Buffer para nome
                let name_len = GetModuleBaseNameW(handle, null_mut(), name_buf.as_mut_ptr(), 260); // Lê nome
                let name = if name_len > 0 {
                    OsString::from_wide(&name_buf[..name_len as usize]).to_string_lossy().to_string() // Converte para String
                } else {
                    "<unknown>".to_string()
                };
                let mut pmc = PROCESS_MEMORY_COUNTERS {
                    cb: size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                    PageFaultCount: 0,
                    PeakWorkingSetSize: 0,
                    WorkingSetSize: 0,
                    QuotaPeakPagedPoolUsage: 0,
                    QuotaPagedPoolUsage: 0,
                    QuotaPeakNonPagedPoolUsage: 0,
                    QuotaNonPagedPoolUsage: 0,
                    PagefileUsage: 0,
                    PeakPagefileUsage: 0,
                };
                let memory_kb = if GetProcessMemoryInfo(handle, &mut pmc, pmc.cb) != 0 {
                    pmc.WorkingSetSize as u64 / 1024 // Memória usada em KB
                } else {
                    0
                };
                CloseHandle(handle); // Fecha handle do processo
                let cpu = cpu_map.get(&pid).cloned().unwrap_or(0.0); // Uso de CPU
                result.push(ProcessInfo {
                    pid,
                    name,
                    memory_kb,
                    cpu,
                });
            }
        }
        result
    }).await.unwrap();

    Json(processes) // Retorna JSON com lista de processos
}

// --- Endpoint de informações detalhadas do sistema ---
async fn get_system_info() -> Json<SystemInfo> {
    // Executa em thread separada para não travar o servidor
    let sysinfo = task::spawn_blocking(|| {
        // --- MEMÓRIA E UPTIME PELO FFI ---
        let mut mem_status = MEMORYSTATUSEX {
            dwLength: size_of::<MEMORYSTATUSEX>() as u32,
            dwMemoryLoad: 0,
            ullTotalPhys: 0,
            ullAvailPhys: 0,
            ullTotalPageFile: 0,
            ullAvailPageFile: 0,
            ullTotalVirtual: 0,
            ullAvailVirtual: 0,
            ullAvailExtendedVirtual: 0,
        };
        let (memory_total_mb, memory_free_mb) = unsafe {
            if GlobalMemoryStatusEx(&mut mem_status) != 0 {
                (mem_status.ullTotalPhys / 1024 / 1024, mem_status.ullAvailPhys / 1024 / 1024)
            } else {
                (0, 0)
            }
        };
        let memory_used_mb = memory_total_mb.saturating_sub(memory_free_mb);
        let memory_percent = if memory_total_mb > 0 {
            format!("{:.1}%", (memory_used_mb as f64 / memory_total_mb as f64) * 100.0)
        } else {
            "0.0%".to_string()
        };

        // Uptime pelo FFI
        let uptime_secs = unsafe { GetTickCount64() / 1000 };
        let hours = uptime_secs / 3600;
        let mins = (uptime_secs % 3600) / 60;
        let uptime = format!("{}h {}m", hours, mins);

        // --- USO POR CORE E TOTAL PELO SYSINFO ---
        let mut sys = System::new_all();
        sys.refresh_all();
        std::thread::sleep(std::time::Duration::from_millis(1000)); // Intervalo entre consultas
        sys.refresh_all();

        let cpu_per_core: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();
        let cpu_total = if !cpu_per_core.is_empty() {
            cpu_per_core.iter().sum::<f32>() / cpu_per_core.len() as f32
        } else {
            0.0
        };

        // --- Informações do sistema ---
        let process_count = sys.processes().len();
        let cpu_base_speed_mhz = sys.cpus().get(0).map(|c| c.frequency());
        let cpu_logical_processors = sys.cpus().len() as u32;

        SystemInfo {
            cpu_total: format!("{:.1}%", cpu_total), // Uso total de CPU (média dos cores)
            cpu_per_core,
            memory_total_mb,
            memory_used_mb,
            memory_free_mb,
            memory_percent,
            uptime,
            process_count,
            cpu_base_speed_mhz,
            cpu_logical_processors,
        }
    }).await.unwrap();

    Json(sysinfo)
}

// --- Função principal: inicializa o servidor HTTP ---
#[tokio::main]
async fn main() {
    // Cria rotas da API
    let app = Router::new()
        .route("/api/processes", get(list_processes)) // Rota para lista de processos
        .route("/api/system", get(get_system_info)); // Rota para info do sistema
    let addr: std::net::SocketAddr = "[::]:3001".parse().unwrap(); // Endereço do servidor (IPv6 e IPv4)
    println!("API rodando em http://localhost:3001/api/");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap(); // Cria listener TCP
    axum::serve(listener, app.into_make_service())
        .await
        .unwrap();
}
