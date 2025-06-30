// Importa módulos e crates necessários
use axum::{routing::get, Router, Json}; // Axum para rotas HTTP e JSON
use sysinfo::{Pid, PidExt, ProcessExt, CpuExt, DiskExt, NetworkExt, UserExt};
use num_cpus;
use std::os::windows::ffi::OsStrExt;
use std::ffi::OsStr;
// --- FFI para sistema de arquivos ---
#[link(name = "kernel32")]
extern "system" {
    fn GetLogicalDrives() -> u32;
    fn GetDriveTypeW(lpRootPathName: *const u16) -> u32;
    fn GetDiskFreeSpaceExW(
        lpDirectoryName: *const u16,
        lpFreeBytesAvailable: *mut u64,
        lpTotalNumberOfBytes: *mut u64,
        lpTotalNumberOfFreeBytes: *mut u64,
    ) -> i32;
}

#[link(name = "kernel32")]
extern "system" {
    fn FindFirstFileW(lpFileName: *const u16, lpFindFileData: *mut WIN32_FIND_DATAW) -> *mut std::ffi::c_void;
    fn FindNextFileW(hFindFile: *mut std::ffi::c_void, lpFindFileData: *mut WIN32_FIND_DATAW) -> i32;
    fn FindClose(hFindFile: *mut std::ffi::c_void) -> i32;
}

#[repr(C)]
#[allow(non_snake_case)]
struct WIN32_FIND_DATAW {
    dwFileAttributes: u32,
    ftCreationTime: u64,
    ftLastAccessTime: u64,
    ftLastWriteTime: u64,
    nFileSizeHigh: u32,
    nFileSizeLow: u32,
    dwReserved0: u32,
    dwReserved1: u32,
    cFileName: [u16; 260],
    cAlternateFileName: [u16; 14],
}
#[derive(Serialize)]
struct PartitionInfo {
    name: String,
    total_bytes: u64,
    free_bytes: u64,
    used_bytes: u64,
    percent_used: f32,
}

#[derive(Serialize)]
struct FileInfo {
    name: String,
    is_dir: bool,
    size: u64,
    readonly: bool,
    hidden: bool,
}
// Endpoint: lista partições e uso
async fn list_partitions() -> Json<Vec<PartitionInfo>> {
    let partitions = task::spawn_blocking(|| unsafe {
        let mut result = Vec::new();
        let drives = GetLogicalDrives();
        for i in 0..26 {
            if (drives & (1 << i)) != 0 {
                let letter = (b'A' + i as u8) as char;
                let path = format!("{}:\\", letter);
                let wpath: Vec<u16> = OsStr::new(&path).encode_wide().chain(Some(0)).collect();
                let drive_type = GetDriveTypeW(wpath.as_ptr());
                if drive_type < 2 { continue; } // ignora drives inválidos
                let mut free = 0u64;
                let mut total = 0u64;
                let mut total_free = 0u64;
                if GetDiskFreeSpaceExW(wpath.as_ptr(), &mut free, &mut total, &mut total_free) != 0 {
                    let used = total - total_free;
                    let percent = if total > 0 { (used as f32 / total as f32) * 100.0 } else { 0.0 };
                    result.push(PartitionInfo {
                        name: path.clone(),
                        total_bytes: total,
                        free_bytes: total_free,
                        used_bytes: used,
                        percent_used: percent,
                    });
                }
            }
        }
        result
    }).await.unwrap();
    Json(partitions)
}

// Endpoint: lista arquivos/diretórios de um caminho
async fn list_files(axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>) -> Json<Vec<FileInfo>> {
    let path = params.get("path").cloned().unwrap_or_else(|| "C:\\".to_string());
    let files = task::spawn_blocking(move || unsafe {
        let mut result = Vec::new();
        let search_path = if path.ends_with("\\") { format!("{}*", path) } else { format!("{}\\*", path) };
        let wpath: Vec<u16> = OsStr::new(&search_path).encode_wide().chain(Some(0)).collect();
        let mut find_data: WIN32_FIND_DATAW = std::mem::zeroed();
        let handle = FindFirstFileW(wpath.as_ptr(), &mut find_data);
        if handle.is_null() {
            return result;
        }
        loop {
            let name = OsString::from_wide(&find_data.cFileName).to_string_lossy().to_string();
            let name = decode_if_encoded(&name.trim_end_matches('\u{0}'));
            if name != "." && name != ".." && !name.is_empty() {
                let is_dir = (find_data.dwFileAttributes & 0x10) != 0;
                let size = ((find_data.nFileSizeHigh as u64) << 32) | (find_data.nFileSizeLow as u64);
                let readonly = (find_data.dwFileAttributes & 0x1) != 0;
                let hidden = (find_data.dwFileAttributes & 0x2) != 0;
                result.push(FileInfo {
                    name: name.clone(),
                    is_dir,
                    size,
                    readonly,
                    hidden,
                });
            }
            if FindNextFileW(handle, &mut find_data) == 0 { break; }
        }
        FindClose(handle);
        result
    }).await.unwrap();
    Json(files)
}
use serde::Serialize; // Para serializar structs em JSON
use std::collections::HashMap; // Mapa para associar PID ao uso de CPU
use std::ffi::OsString; // Para manipular strings do Windows
use std::mem::size_of; // Para obter tamanho de structs
use std::os::windows::ffi::OsStringExt; // Para converter strings do Windows
use std::ptr::null_mut; // Para ponteiros nulos
use tokio::task; // Para executar tarefas bloqueantes em threads separadas
use sysinfo::System; // Para obter informações do sistema
use sysinfo::SystemExt;

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
    ullAvailExtendedVirtual: u64, // Memória virtual estendida disponível
}

// --- Constantes ---
const PROCESS_QUERY_INFORMATION: u32 = 0x0400; // Permissão para consultar info do processo
const PROCESS_VM_READ: u32 = 0x0010; // Permissão para ler memória do processo
const MAX_PROCESSES: usize = 1024; // Máximo de processos a listar

// --- Structs de resposta ---
// Struct para resposta de cada thread
#[derive(Serialize)]
struct ThreadInfo {
    tid: u32,
    base_priority: i32,
    delta_priority: i32,
    start_address: u64,
    state: String,
    wait_reason: String,
    context_switches: Option<u64>,
    user_time_ms: Option<u64>,
    kernel_time_ms: Option<u64>,
}

// Struct para resposta de cada processo
#[derive(Serialize)]
struct ProcessInfo {
    pid: u32,            // ID do processo
    name: String,        // Nome do executável
    exe_path: Option<String>, // Caminho completo do executável
    status: String,      // Status do processo (Running, Suspended, etc.)
    username: String,    // Usuário dono do processo
    cpu: f32,            // Uso de CPU (%)
    memory_kb: u64,      // Memória usada em KB
    arch: String,        // Arquitetura (x86/x64)
    description: String, // Descrição do processo
    page_faults: u32,
    peak_working_set_kb: u64,
    working_set_kb: u64,
    pagefile_kb: u64,
    io_read_bytes: Option<u64>,
    io_write_bytes: Option<u64>,
    io_read_ops: Option<u64>,
    io_write_ops: Option<u64>,
    handle_count: Option<u32>,
    thread_count: Option<u32>,
    parent_pid: Option<u32>,
    priority: Option<i32>,
    creation_time: Option<u64>,
    session_id: Option<u32>,
    command_line: Option<String>,
    environment: Option<Vec<String>>,
    threads: Vec<ThreadInfo>,
}

// Struct para resposta de informações do sistema
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskInfo {
    name: String,
    total_bytes: u64,
    free_bytes: u64,
    used_bytes: u64,
    percent_used: f32,
    file_system: String,
    is_system: bool,
    has_pagefile: bool,
    disk_type: String,
    read_bytes: u64,
    write_bytes: u64,
    transfer_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetAdapterInfo {
    name: String,
    description: String,
    mac: String,
    ipv4: Vec<String>,
    ipv6: Vec<String>,
    rx_bytes: u64,
    tx_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GpuInfo {
    name: String,
    driver_version: String,
    memory_total_mb: Option<u64>,
    memory_used_mb: Option<u64>,
    utilization_percent: Option<u32>,
}

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
    uptime_secs: u64,            // Uptime em segundos
    process_count: usize,        // Total de processos
    cpu_base_speed_mhz: Option<u64>, // Clock base (primeiro core)
    cpu_logical_processors: u32,     // Núcleos lógicos
    cpu_vendor: Option<String>,      // Fabricante CPU
    cpu_brand: Option<String>,       // Nome completo CPU
    cpu_physical_cores: Option<u32>, // Núcleos físicos
    disks: Vec<DiskInfo>,            // Informações detalhadas dos discos
    net: Vec<NetAdapterInfo>,        // Adaptadores de rede
    gpus: Vec<GpuInfo>,              // Placas de vídeo
    os_name: Option<String>,         // Nome do SO
    os_version: Option<String>,      // Versão do SO
    os_build: Option<String>,        // Build do SO
    hostname: Option<String>,        // Nome da máquina
    user: Option<String>,            // Usuário atual
    boot_time: Option<u64>,          // Timestamp do boot
}

// --- Checagem de privilégio de administrador ---
#[link(name = "advapi32")]
extern "system" {
    fn GetCurrentProcess() -> *mut std::ffi::c_void;
}

#[repr(C)]
struct TOKEN_ELEVATION {
    TokenIsElevated: u32,
}

fn is_running_as_admin() -> bool {
    unsafe {
        let mut token: *mut std::ffi::c_void = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), 0x0008, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut ret_len = 0u32;
        let res = GetTokenInformation(
            token,
            20, // TokenElevation
            &mut elevation as *mut _ as *mut u8,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        );
        res != 0 && elevation.TokenIsElevated != 0
    }
}

// --- Função utilitária para decodificar strings potencialmente codificadas ---
fn decode_if_encoded(s: &str) -> String {
    // Remove caracteres não imprimíveis e tenta decodificar base64/hex se parecer codificado
    let clean = s.chars().filter(|c| c.is_ascii_graphic() || c.is_ascii_whitespace()).collect::<String>();
    // Detecta base64
    if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(&clean) {
        if let Ok(as_utf8) = String::from_utf8(decoded.clone()) {
            if as_utf8.chars().all(|c| c.is_ascii_graphic() || c.is_ascii_whitespace()) && as_utf8.len() > 2 {
                return as_utf8;
            }
        }
    }
    // Detecta hexadecimal
    if clean.len() % 2 == 0 && clean.chars().all(|c| c.is_ascii_hexdigit()) {
        if let Ok(bytes) = (0..clean.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&clean[i..i + 2], 16))
            .collect::<Result<Vec<_>, _>>()
        {
            if let Ok(as_utf8) = String::from_utf8(bytes.clone()) {
                if as_utf8.chars().all(|c| c.is_ascii_graphic() || c.is_ascii_whitespace()) && as_utf8.len() > 2 {
                    return as_utf8;
                }
            }
        }
    }
    clean
}

// --- Lista de processos via FFI + uso de CPU via sysinfo ---
async fn list_processes() -> Json<Vec<ProcessInfo>> {
    // Executa em thread separada para não travar o servidor
    let processes = task::spawn_blocking(|| {
        // Checa privilégio admin
        if !is_running_as_admin() {
            eprintln!("[ERRO] O backend precisa ser executado como administrador para acesso total aos dados do sistema.");
            std::process::exit(1);
        }

        let mut sys = System::new_all();
        sys.refresh_all();
        std::thread::sleep(std::time::Duration::from_millis(1000));
        sys.refresh_all();

        let mut cpu_map: HashMap<u32, f32> = HashMap::new();
        for (pid, proc_) in sys.processes() {
            cpu_map.insert(pid.as_u32(), proc_.cpu_usage());
        }

        let mut result = Vec::new();
        unsafe {
            let mut pids = [0u32; MAX_PROCESSES];
            let mut needed = 0u32;
            if EnumProcesses(pids.as_mut_ptr(), (MAX_PROCESSES * 4) as u32, &mut needed) == 0 {
                return result;
            }
            let count = needed as usize / 4;
            for &pid in &pids[..count] {
                if pid == 0 {
                    continue;
                }
                let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
                if handle.is_null() {
                    continue;
                }
                // Nome do executável
                let mut name_buf = [0u16; 260];
                let name_len = GetModuleBaseNameW(handle, null_mut(), name_buf.as_mut_ptr(), 260);
                let name = if name_len > 0 {
                    OsString::from_wide(&name_buf[..name_len as usize]).to_string_lossy().to_string()
                } else {
                    "<unknown>".to_string()
                };
                // Caminho completo do executável (via sysinfo, fallback)
                let exe_path = sys.process(Pid::from_u32(pid)).map(|p| p.exe().to_string_lossy().to_string());
                // Memória
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
                    pmc.WorkingSetSize as u64 / 1024
                } else {
                    0
                };
                // Status do processo (sysinfo ou fallback)
                let status = sys.process(Pid::from_u32(pid)).map(|p| format!("{:?}", p.status())).unwrap_or_else(|| "Running".to_string());
                // Arquitetura do processo
                let mut is_wow64: i32 = 0;
                let arch = if is_process_wow64(handle, &mut is_wow64) {
                    if is_wow64 != 0 { "x86" } else { "x64" }
                } else {
                    "Desconhecida"
                }.to_string();
                // Nome do usuário dono do processo
                let username = get_process_username(handle).unwrap_or_else(|| "<desconhecido>".to_string());
                // Descrição do processo (pega do arquivo, se possível)
                let description = get_process_description(&name).unwrap_or_else(|| "".to_string());
                let cpu = cpu_map.get(&pid).cloned().unwrap_or(0.0);

                // Métricas detalhadas de memória
                let page_faults = pmc.PageFaultCount;
                let peak_working_set_kb = pmc.PeakWorkingSetSize as u64 / 1024;
                let working_set_kb = pmc.WorkingSetSize as u64 / 1024;
                let pagefile_kb = pmc.PagefileUsage as u64 / 1024;

                // I/O e handles
                let (io_read_bytes, io_write_bytes, io_read_ops, io_write_ops) = get_process_io_counters(handle);
                let handle_count = get_process_handle_count(handle);
                let thread_count = get_process_thread_count(handle);

                // Parent PID, prioridade, criação, sessão, cmdline, env (sysinfo ou fallback)
                let parent_pid = sys.process(Pid::from_u32(pid)).and_then(|p| p.parent().map(|pp| pp.as_u32()));
                let priority = sys.process(Pid::from_u32(pid)).map(|p| p.priority());
                let creation_time = sys.process(Pid::from_u32(pid)).map(|p| p.start_time());
                let session_id = sys.process(Pid::from_u32(pid)).map(|p| p.session_id());
                let command_line = sys.process(Pid::from_u32(pid)).map(|p| p.cmd().join(" "));
                let environment = sys.process(Pid::from_u32(pid)).map(|p| p.environ().to_vec());

                // Threads do processo
                let threads = get_threads_for_process(pid);

                result.push(ProcessInfo {
                    pid,
                    name,
                    exe_path,
                    status,
                    username,
                    cpu,
                    memory_kb,
                    arch,
                    description,
                    page_faults,
                    peak_working_set_kb,
                    working_set_kb,
                    pagefile_kb,
                    io_read_bytes,
                    io_write_bytes,
                    io_read_ops,
                    io_write_ops,
                    handle_count,
                    thread_count,
                    parent_pid,
                    priority,
                    creation_time,
                    session_id,
                    command_line,
                    environment,
                    threads,
                });
                CloseHandle(handle);
            }
        }
        result
    }).await.unwrap();
    // Decodifica e valida todos os campos de string do resultado de processos
    let processes: Vec<ProcessInfo> = processes.into_iter().map(|mut p| {
        p.name = decode_if_encoded(&p.name);
        p.exe_path = p.exe_path.map(|v| decode_if_encoded(&v));
        p.status = decode_if_encoded(&p.status);
        p.username = decode_if_encoded(&p.username);
        p.arch = decode_if_encoded(&p.arch);
        p.description = decode_if_encoded(&p.description);
        p.command_line = p.command_line.map(|v| decode_if_encoded(&v));
        p.environment = p.environment.map(|env| env.into_iter().map(|v| decode_if_encoded(&v)).collect());
        p.threads = p.threads.into_iter().map(|mut t| {
            t.state = decode_if_encoded(&t.state);
            t.wait_reason = decode_if_encoded(&t.wait_reason);
            t
        }).collect();
        p
    }).collect();
    Json(processes)
}
// --- FFI para I/O e handles de processo ---
#[repr(C)]
struct IO_COUNTERS {
    ReadOperationCount: u64,
    WriteOperationCount: u64,
    OtherOperationCount: u64,
    ReadTransferCount: u64,
    WriteTransferCount: u64,
    OtherTransferCount: u64,
}

#[link(name = "kernel32")]
extern "system" {
    fn GetProcessIoCounters(hProcess: *mut std::ffi::c_void, lpIoCounters: *mut IO_COUNTERS) -> i32;
    fn GetProcessHandleCount(hProcess: *mut std::ffi::c_void, pdwHandleCount: *mut u32) -> i32;
    fn GetProcessIdOfThread(hThread: *mut std::ffi::c_void) -> u32;
}

fn get_process_io_counters(handle: *mut std::ffi::c_void) -> (Option<u64>, Option<u64>, Option<u64>, Option<u64>) {
    unsafe {
        let mut io: IO_COUNTERS = std::mem::zeroed();
        if GetProcessIoCounters(handle, &mut io) != 0 {
            (Some(io.ReadTransferCount), Some(io.WriteTransferCount), Some(io.ReadOperationCount), Some(io.WriteOperationCount))
        } else {
            (None, None, None, None)
        }
    }
}

fn get_process_handle_count(handle: *mut std::ffi::c_void) -> Option<u32> {
    unsafe {
        let mut count = 0u32;
        if GetProcessHandleCount(handle, &mut count) != 0 {
            Some(count)
        } else {
            None
        }
    }
}

fn get_process_thread_count(handle: *mut std::ffi::c_void) -> Option<u32> {
    None
}
// --- FFI para threads ---
#[repr(C)]
struct THREADENTRY32 {
    dwSize: u32,
    cntUsage: u32,
    th32ThreadID: u32,
    th32OwnerProcessID: u32,
    tpBasePri: i32,
    tpDeltaPri: i32,
    dwFlags: u32,
}

#[link(name = "kernel32")]
extern "system" {
    fn CreateToolhelp32Snapshot(dwFlags: u32, th32ProcessID: u32) -> *mut std::ffi::c_void;
    fn Thread32First(hSnapshot: *mut std::ffi::c_void, lpte: *mut THREADENTRY32) -> i32;
    fn Thread32Next(hSnapshot: *mut std::ffi::c_void, lpte: *mut THREADENTRY32) -> i32;
}

const TH32CS_SNAPTHREAD: u32 = 0x00000004;

fn get_threads_for_process(pid: u32) -> Vec<ThreadInfo> {
    let mut threads = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if snapshot.is_null() {
            return threads;
        }
        let mut entry: THREADENTRY32 = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
        let mut ok = Thread32First(snapshot, &mut entry);
        while ok != 0 {
            if entry.th32OwnerProcessID == pid {
                // Abrir handle da thread para detalhes
                let h_thread = OpenThread(0x0040 | 0x0010 | 0x0008, 0, entry.th32ThreadID); // THREAD_QUERY_INFORMATION | THREAD_QUERY_LIMITED_INFORMATION | THREAD_GET_CONTEXT
                let mut start_address = 0u64;
                let mut state = "Desconhecido".to_string();
                let mut wait_reason = "Desconhecido".to_string();
                let mut context_switches = None;
                let mut user_time_ms = None;
                let mut kernel_time_ms = None;
                if !h_thread.is_null() {
                    // GetThreadTimes
                    let mut create_time = std::mem::zeroed();
                    let mut exit_time = std::mem::zeroed();
                    let mut kernel_time = std::mem::zeroed();
                    let mut user_time = std::mem::zeroed();
                    if GetThreadTimes(h_thread, &mut create_time, &mut exit_time, &mut kernel_time, &mut user_time) != 0 {
                        kernel_time_ms = Some(filetime_to_ms(kernel_time));
                        user_time_ms = Some(filetime_to_ms(user_time));
                    }
                    // NtQueryInformationThread para detalhes avançados
                    let mut info: THREAD_BASIC_INFORMATION = std::mem::zeroed();
                    let status = NtQueryInformationThread(
                        h_thread,
                        0, // ThreadBasicInformation
                        &mut info as *mut _ as *mut _,
                        std::mem::size_of::<THREAD_BASIC_INFORMATION>() as u32,
                        std::ptr::null_mut(),
                    );
                    if status == 0 {
                        start_address = info.StartAddress as u64;
                        state = thread_state_to_str(info.State);
                        wait_reason = thread_wait_reason_to_str(info.WaitReason);
                    }
                    // Preenche como None
                    CloseHandle(h_thread);
                }
                threads.push(ThreadInfo {
                    tid: entry.th32ThreadID,
                    base_priority: entry.tpBasePri,
                    delta_priority: entry.tpDeltaPri,
                    start_address,
                    state,
                    wait_reason,
                    context_switches,
                    user_time_ms,
                    kernel_time_ms,
                });
            }
            ok = Thread32Next(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
    }
    threads
}

// --- FFI para threads detalhadas ---
#[link(name = "kernel32")]
extern "system" {
    fn OpenThread(dwDesiredAccess: u32, bInheritHandle: u32, dwThreadId: u32) -> *mut std::ffi::c_void;
    fn GetThreadTimes(
        hThread: *mut std::ffi::c_void,
        lpCreationTime: *mut FILETIME,
        lpExitTime: *mut FILETIME,
        lpKernelTime: *mut FILETIME,
        lpUserTime: *mut FILETIME,
    ) -> i32;
}

#[repr(C)]
#[derive(Copy, Clone)]
struct FILETIME {
    dwLowDateTime: u32,
    dwHighDateTime: u32,
}

fn filetime_to_ms(ft: FILETIME) -> u64 {
    let quad = ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64);
    quad / 10_000 // 100ns para ms
}

// --- NTAPI para ThreadBasicInformation ---
#[repr(C)]
struct THREAD_BASIC_INFORMATION {
    ExitStatus: i32,
    TebBaseAddress: *mut std::ffi::c_void,
    ClientId: [usize; 2],
    AffinityMask: usize,
    Priority: i32,
    BasePriority: i32,
    State: u32,
    WaitReason: u32,
    StartAddress: *mut std::ffi::c_void,
}

#[link(name = "ntdll")]
extern "system" {
    fn NtQueryInformationThread(
        ThreadHandle: *mut std::ffi::c_void,
        ThreadInformationClass: u32,
        ThreadInformation: *mut std::ffi::c_void,
        ThreadInformationLength: u32,
        ReturnLength: *mut u32,
    ) -> i32;
}

fn thread_state_to_str(state: u32) -> String {
    match state {
        0 => "Initialized",
        1 => "Ready",
        2 => "Running",
        3 => "Standby",
        4 => "Terminated",
        5 => "Waiting",
        6 => "Transition",
        7 => "DeferredReady",
        8 => "GateWait",
        _ => "Desconhecido",
    }.to_string()
}
fn thread_wait_reason_to_str(reason: u32) -> String {
    match reason {
        0 => "Executive",
        1 => "FreePage",
        2 => "PageIn",
        3 => "PoolAllocation",
        4 => "DelayExecution",
        5 => "Suspended",
        6 => "UserRequest",
        7 => "WrExecutive",
        8 => "WrFreePage",
        9 => "WrPageIn",
        10 => "WrPoolAllocation",
        11 => "WrDelayExecution",
        12 => "WrSuspended",
        13 => "WrUserRequest",
        14 => "WrEventPair",
        15 => "WrQueue",
        16 => "WrLpcReceive",
        17 => "WrLpcReply",
        18 => "WrVirtualMemory",
        19 => "WrPageOut",
        20 => "WrRendezvous",
        21 => "Spare2",
        22 => "Spare3",
        23 => "Spare4",
        24 => "Spare5",
        25 => "WrCalloutStack",
        26 => "WrKernel",
        27 => "WrResource",
        28 => "WrPushLock",
        29 => "WrMutex",
        30 => "WrQuantumEnd",
        31 => "WrDispatchInt",
        32 => "WrPreempted",
        33 => "WrYieldExecution",
        34 => "WrFastMutex",
        35 => "WrGuardedMutex",
        36 => "WrRundown",
        _ => "Desconhecido",
    }.to_string()
}

// FFI para checar arquitetura do processo
#[link(name = "kernel32")]
extern "system" {
    fn IsWow64Process(hProcess: *mut std::ffi::c_void, Wow64Process: *mut i32) -> i32;
}
fn is_process_wow64(handle: *mut std::ffi::c_void, is_wow64: &mut i32) -> bool {
    unsafe { IsWow64Process(handle, is_wow64 as *mut i32) != 0 }
}

// FFI para obter usuário do processo
#[link(name = "advapi32")]
extern "system" {
    fn OpenProcessToken(ProcessHandle: *mut std::ffi::c_void, DesiredAccess: u32, TokenHandle: *mut *mut std::ffi::c_void) -> i32;
    fn GetTokenInformation(TokenHandle: *mut std::ffi::c_void, TokenInformationClass: u32, TokenInformation: *mut u8, TokenInformationLength: u32, ReturnLength: *mut u32) -> i32;
    fn LookupAccountSidW(lpSystemName: *const u16, Sid: *const std::ffi::c_void, Name: *mut u16, cchName: *mut u32, ReferencedDomainName: *mut u16, cchReferencedDomainName: *mut u32, peUse: *mut u32) -> i32;
}
fn get_process_username(handle: *mut std::ffi::c_void) -> Option<String> {
    unsafe {
        let mut token: *mut std::ffi::c_void = std::ptr::null_mut();
        if OpenProcessToken(handle, 0x0008, &mut token) == 0 { return None; }
        let mut len = 0u32;
        GetTokenInformation(token, 1, std::ptr::null_mut(), 0, &mut len);
        let mut buf = vec![0u8; len as usize];
        if GetTokenInformation(token, 1, buf.as_mut_ptr(), len, &mut len) == 0 { return None; }
        let sid = buf.as_ptr();
        let mut name = [0u16; 256];
        let mut name_len = 256u32;
        let mut domain = [0u16; 256];
        let mut domain_len = 256u32;
        let mut pe_use = 0u32;
        if LookupAccountSidW(std::ptr::null(), sid as *const _, name.as_mut_ptr(), &mut name_len, domain.as_mut_ptr(), &mut domain_len, &mut pe_use) == 0 {
            return None;
        }
        let name = String::from_utf16_lossy(&name[..name_len as usize]);
        let domain = String::from_utf16_lossy(&domain[..domain_len as usize]);
        if !domain.is_empty() {
            Some(format!("{}\\{}", domain, name))
        } else {
            Some(name)
        }
    }
}

// FFI para obter descrição do executável
#[link(name = "version")]
extern "system" {
    fn GetFileVersionInfoSizeW(lptstrFilename: *const u16, lpdwHandle: *mut u32) -> u32;
    fn GetFileVersionInfoW(lptstrFilename: *const u16, dwHandle: u32, dwLen: u32, lpData: *mut u8) -> i32;
    fn VerQueryValueW(pBlock: *const u8, lpSubBlock: *const u16, lplpBuffer: *mut *mut u16, puLen: *mut u32) -> i32;
}
fn get_process_description(exe_name: &str) -> Option<String> {
    use std::path::Path;
    let path = Path::new(exe_name);
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut handle = 0u32;
    let size = unsafe { GetFileVersionInfoSizeW(wide.as_ptr(), &mut handle) };
    if size == 0 { return None; }
    let mut buf = vec![0u8; size as usize];
    if unsafe { GetFileVersionInfoW(wide.as_ptr(), 0, size, buf.as_mut_ptr()) } == 0 { return None; }
    let mut ptr: *mut u16 = std::ptr::null_mut();
    let mut len = 0u32;
    let subblock: Vec<u16> = "\\StringFileInfo\\040904b0\\FileDescription".encode_utf16().chain(Some(0)).collect();
    if unsafe { VerQueryValueW(buf.as_ptr(), subblock.as_ptr(), &mut ptr, &mut len) } == 0 { return None; }
    if ptr.is_null() || len == 0 { return None; }
    Some(unsafe { String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len as usize - 1)) })
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
        let (memory_total_mb, memory_free_mb, memory_total, memory_free) = unsafe {
            if GlobalMemoryStatusEx(&mut mem_status) != 0 {
                (mem_status.ullTotalPhys / 1024 / 1024, mem_status.ullAvailPhys / 1024 / 1024, mem_status.ullTotalPhys, mem_status.ullAvailPhys)
            } else {
                (0, 0, 0, 0)
            }
        };
        let memory_used_mb = memory_total_mb.saturating_sub(memory_free_mb);
        let memory_percent = if memory_total_mb > 0 {
            format!("{:.1}%", (memory_used_mb as f64 / memory_total_mb as f64) * 100.0)
        } else {
            "0.0%".to_string()
        };

        // Uptime pelo FFI
        let uptime_ms = unsafe { GetTickCount64() };
        let uptime_secs = uptime_ms / 1000;
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
        let cpu_vendor = sys.cpus().get(0).map(|c| decode_if_encoded(&c.vendor_id().to_string()));
        let cpu_brand = sys.cpus().get(0).map(|c| decode_if_encoded(&c.brand().to_string()));
        let os_name = sys.name().map(|s| decode_if_encoded(&s.to_string()));
        let os_version = sys.os_version().map(|s| decode_if_encoded(&s.to_string()));
        let os_build = sys.kernel_version().map(|s| decode_if_encoded(&s.to_string()));
        let hostname = sys.host_name().map(|s| decode_if_encoded(&s.to_string()));
        let user = sys.users().get(0).map(|u| decode_if_encoded(&u.name().to_string()));
        let boot_time = sys.boot_time();

        // --- Informações detalhadas dos discos ---
        let mut disks = Vec::new();
        let sys_disks = sys.disks();
        unsafe {
            let drives = GetLogicalDrives();
            for i in 0..26 {
                if (drives & (1 << i)) != 0 {
                    let letter = (b'A' + i as u8) as char;
                    let path = format!("{}:\\", letter);
                    let mut wpath: Vec<u16> = OsStr::new(&path).encode_wide().chain(Some(0)).collect();
                    let drive_type = GetDriveTypeW(wpath.as_ptr());
                    if drive_type < 2 { continue; }
                    let mut free = 0u64;
                    let mut total = 0u64;
                    let mut total_free = 0u64;
                    let _ = GetDiskFreeSpaceExW(wpath.as_ptr(), &mut free, &mut total, &mut total_free);
                    let file_system = get_volume_file_system(&path).unwrap_or_else(|| "Desconhecido".to_string());
                    let is_system = is_system_drive(&path);
                    let has_pagefile = has_pagefile_on_drive(&path);
                    let disk_type = get_disk_type(drive_type);

                    // Tenta obter métricas via sysinfo (última prioridade)
                    let (read_bytes, write_bytes, transfer_bytes) = if let Some(disk) = sys_disks.iter().find(|d| {
                        let mount = d.mount_point().to_string_lossy().to_uppercase();
                        mount.starts_with(&path.to_uppercase())
                    }) {
                        (disk.total_read_bytes(), disk.total_written_bytes(), disk.total_read_bytes() + disk.total_written_bytes())
                    } else {
                        (0, 0, 0)
                    };

                    disks.push(DiskInfo {
                        name: path.clone(),
                        total_bytes: total,
                        free_bytes: total_free,
                        used_bytes: total.saturating_sub(total_free),
                        percent_used: if total > 0 { ((total - total_free) as f32 / total as f32) * 100.0 } else { 0.0 },
                        file_system,
                        is_system,
                        has_pagefile,
                        disk_type,
                        read_bytes,
                        write_bytes,
                        transfer_bytes,
                    });
                }
            }
        }

        // --- Métricas de rede (sysinfo, pois WinAPI é muito trabalhosa para estatísticas por adaptador) ---
        let mut net = Vec::new();
        for (name, data) in sys.networks() {
            net.push(NetAdapterInfo {
                name: name.clone(),
                description: name.clone(),
                mac: String::new(),
                ipv4: Vec::new(),
                ipv6: Vec::new(),
                rx_bytes: data.received(),
                tx_bytes: data.transmitted(),
            });
        }

        // --- Métricas de GPU (sysinfo, se disponível) ---
        let gpus = Vec::new();

        // Núcleos físicos
        let cpu_physical_cores = num_cpus::get_physical() as u32;
        SystemInfo {
            cpu_total: format!("{:.1}%", cpu_total), // Uso total de CPU (média dos cores)
            cpu_per_core,
            memory_total_mb,
            memory_used_mb,
            memory_free_mb,
            memory_percent,
            uptime,
            uptime_secs,
            process_count,
            cpu_base_speed_mhz,
            cpu_logical_processors,
            cpu_vendor,
            cpu_brand,
            cpu_physical_cores: Some(cpu_physical_cores),
            disks,
            net,
            gpus,
            os_name,
            os_version,
            os_build,
            hostname,
            user,
            boot_time: Some(boot_time),
        }
    }).await.unwrap();

    Json(sysinfo);
// --- Funções auxiliares para informações de disco ---
#[link(name = "kernel32")]
extern "system" {
    fn GetVolumeInformationW(
        lpRootPathName: *const u16,
        lpVolumeNameBuffer: *mut u16,
        nVolumeNameSize: u32,
        lpVolumeSerialNumber: *mut u32,
        lpMaximumComponentLength: *mut u32,
        lpFileSystemFlags: *mut u32,
        lpFileSystemNameBuffer: *mut u16,
        nFileSystemNameSize: u32,
    ) -> i32;
}
fn get_volume_file_system(path: &str) -> Option<String> {
    let mut fs_buf = [0u16; 32];
    let wpath: Vec<u16> = OsStr::new(path).encode_wide().chain(Some(0)).collect();
    let ok = unsafe {
        GetVolumeInformationW(
            wpath.as_ptr(),
            null_mut(),
            0,
            null_mut(),
            null_mut(),
            null_mut(),
            fs_buf.as_mut_ptr(),
            fs_buf.len() as u32,
        )
    };
    if ok != 0 {
        let fs = String::from_utf16_lossy(&fs_buf);
        Some(fs.trim_end_matches('\u{0}').to_string())
    } else {
        None
    }
}

fn is_system_drive(path: &str) -> bool {
    // Considera C:\ como disco de sistema
    path.to_uppercase().starts_with("C:")
}

fn has_pagefile_on_drive(path: &str) -> bool {
    // Verifica se pagefile.sys existe na raiz do drive
    let pagefile = format!("{}pagefile.sys", path);
    std::path::Path::new(&pagefile).exists()
}

fn get_disk_type(drive_type: u32) -> String {
    match drive_type {
        2 => "Removível".to_string(),
        3 => "Fixo (HDD/SSD)".to_string(),
        4 => "Rede".to_string(),
        5 => "CD/DVD".to_string(),
        6 => "RAM Disk".to_string(),
        _ => "Desconhecido".to_string(),
    }
}
}

// --- Função principal: inicializa o servidor HTTP ---
#[tokio::main]
async fn main() {
    // Cria rotas da API
    let app = Router::new()
        .route("/api/processes", get(list_processes)) // Rota para lista de processos
        .route("/api/system", get(get_system_info)) // Rota para info do sistema
        .route("/api/filesystem/partitions", get(list_partitions)) // Rota para partições
        .route("/api/filesystem/list", get(list_files)) // Rota para listar arquivos
        .route("/api/processes/:pid/handles", get(list_process_handles)); // Handles abertos por processo
    let addr: std::net::SocketAddr = "[::]:3001".parse().unwrap(); // Endereço do servidor (IPv6 e IPv4)
    println!("API rodando em http://localhost:3001/api/");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap(); // Cria listener TCP
    axum::serve(listener, app.into_make_service())
        .await
        .unwrap();
}
// --- Struct para handle aberto ---
#[derive(Serialize)]
pub struct HandleInfo {
    pub handle: u16,
    pub object_type: String,
    pub name: String,
    pub access: u32,
}

// --- Endpoint: handles abertos de um processo ---
async fn list_process_handles(axum::extract::Path(pid): axum::extract::Path<u32>) -> Json<Vec<HandleInfo>> {
    let handles = task::spawn_blocking(move || {
        if !is_running_as_admin() {
            eprintln!("[ERRO] O backend precisa ser executado como administrador para acessar handles de processo.");
            std::process::exit(1);
        }
        get_handles_for_process(pid)
    }).await.unwrap();
    // Decodifica e valida todos os campos de string
    let handles: Vec<HandleInfo> = handles.into_iter().map(|mut h| {
        h.object_type = decode_if_encoded(&h.object_type);
        h.name = decode_if_encoded(&h.name);
        h
    }).collect();
    Json(handles)
}

// --- FFI/NTAPI para handles do sistema ---
#[repr(C)]
struct SYSTEM_HANDLE {
    ProcessId: u32,
    ObjectTypeNumber: u8,
    Flags: u8,
    Handle: u16,
    Object: usize,
    GrantedAccess: u32,
}

#[repr(C)]
struct SYSTEM_HANDLE_INFORMATION {
    HandleCount: u32,
    Handles: [SYSTEM_HANDLE; 1],
}

#[link(name = "ntdll")]
extern "system" {
    fn NtQuerySystemInformation(
        SystemInformationClass: u32,
        SystemInformation: *mut std::ffi::c_void,
        SystemInformationLength: u32,
        ReturnLength: *mut u32,
    ) -> i32;
}

fn get_handles_for_process(pid: u32) -> Vec<HandleInfo> {
    const SystemHandleInformation: u32 = 16;
    let mut size = 0x10000;
    let mut buffer = Vec::with_capacity(size);
    let mut needed = 0u32;
    let mut result = Vec::new();
    unsafe {
        loop {
            let status = NtQuerySystemInformation(
                SystemHandleInformation,
                buffer.as_mut_ptr() as *mut _,
                size as u32,
                &mut needed,
            );
            if status == 0 {
                break;
            } else if status == 0xC0000004 { // STATUS_INFO_LENGTH_MISMATCH
                size *= 2;
                buffer.reserve(size - buffer.len());
            } else {
                return result;
            }
        }
        let handle_info = &*(buffer.as_ptr() as *const SYSTEM_HANDLE_INFORMATION);
        let count = handle_info.HandleCount as usize;
        let handles_ptr = &handle_info.Handles as *const SYSTEM_HANDLE;
        for i in 0..count {
            let h = &*handles_ptr.add(i);
            if h.ProcessId == pid {
                // Para detalhes do objeto, seria necessário duplicar o handle e consultar o tipo/nome
                result.push(HandleInfo {
                    handle: h.Handle,
                    object_type: format!("{}", h.ObjectTypeNumber),
                    name: String::new(),
                    access: h.GrantedAccess,
                });
            }
        }
    }
    result
}
