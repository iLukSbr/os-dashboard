use windows::Win32::Foundation::{HANDLE, CloseHandle};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ, GetPriorityClass};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Thread32First, Thread32Next, THREADENTRY32, TH32CS_SNAPTHREAD};
use windows::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows::Win32::System::Threading::{GetProcessIoCounters, IO_COUNTERS};
use windows::Win32::Security::{GetTokenInformation, TokenUser, LookupAccountSidW, TOKEN_QUERY, TOKEN_USER, SID_NAME_USE};
// FFI manual para OpenProcessToken
#[link(name = "advapi32")]
extern "system" {
    fn OpenProcessToken(
        ProcessHandle: HANDLE,
        DesiredAccess: u32,
        TokenHandle: *mut HANDLE,
    ) -> i32;
}
use windows::core::PWSTR;

use std::ptr;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;

// --- Handles e recursos abertos por processo ---
use crate::process::handle::{NtQuerySystemInformation, SYSTEM_HANDLE, SYSTEM_HANDLE_INFORMATION};

fn get_process_handles_and_resources(pid: u32) -> (Option<u32>, Option<Vec<String>>) {
    unsafe {
        let mut buffer = vec![0u8; 1024 * 1024];
        let mut return_length = 0u32;
        let status = NtQuerySystemInformation(
            16, // SystemHandleInformation
            buffer.as_mut_ptr() as *mut _,
            buffer.len() as u32,
            &mut return_length,
        );
        if status != 0 {
            return (None, None);
        }
        let handle_info = buffer.as_ptr() as *const SYSTEM_HANDLE_INFORMATION;
        let handle_count = (*handle_info).HandleCount;
        let handle_ptr = &(*handle_info).Handles as *const SYSTEM_HANDLE;
        let mut resources = Vec::new();
        let mut count = 0u32;
        for i in 0..handle_count {
            let handle = (*handle_ptr.add(i as usize)).clone();
            if handle.ProcessId != pid { continue; }
            count += 1;
            // Tenta identificar o tipo do handle (simplificado)
            let type_str = match handle.ObjectTypeNumber {
                0x1C | 0x1F => "Arquivo", // File
                0x1E => "Mutex",
                0x1D => "Semáforo",
                0x1B => "Pipe",
                0x1A => "Socket",
                _ => "Outro",
            };
            resources.push(format!("{}: Handle=0x{:X}", type_str, handle.Handle));
        }
        (Some(count), Some(resources))
    }
}
// Helper para obter detalhes de threads do processo
fn get_process_threads(pid: u32) -> Vec<ThreadInfo> {
    let mut threads = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0).unwrap();
        let mut entry = THREADENTRY32 { dwSize: std::mem::size_of::<THREADENTRY32>() as u32, ..Default::default() };
        if Thread32First(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32OwnerProcessID == pid {
                    threads.push(ThreadInfo {
                        tid: entry.th32ThreadID,
                        base_priority: entry.tpBasePri as i32,
                        delta_priority: entry.tpDeltaPri as i32,
                        start_address: 0,
                        state: String::new(),
                        wait_reason: String::new(),
                        context_switches: None,
                        user_time_ms: None,
                        kernel_time_ms: None,
                    });
                }
                if Thread32Next(snapshot, &mut entry).is_err() { break; }
            }
        }
        CloseHandle(snapshot).ok();
    }
    threads
}
// Helper para abrir processo com fallback
fn open_process(pid: u32) -> Option<HANDLE> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if let Ok(h) = handle { Some(h) } else { None }
    }
}

// Helper para obter usuário do processo
fn get_process_username(pid: u32) -> Option<String> {
    unsafe {
        let handle = match open_process(pid) {
            Some(h) => h,
            None => return None,
        };
        let mut token = HANDLE(ptr::null_mut());
        if OpenProcessToken(handle, TOKEN_QUERY.0 as u32, &mut token) == 0 {
            CloseHandle(handle).ok();
            return None;
        }
        let mut ret_len = 0u32;
        let _ = GetTokenInformation(token, TokenUser, None, 0, &mut ret_len);
        if ret_len == 0 {
            CloseHandle(token).ok();
            CloseHandle(handle).ok();
            return None;
        }
        let mut buf = vec![0u8; ret_len as usize];
        let ok = GetTokenInformation(token, TokenUser, Some(buf.as_mut_ptr() as _), ret_len, &mut ret_len).is_ok();
        if !ok {
            CloseHandle(token).ok();
            CloseHandle(handle).ok();
            return None;
        }
        let user = &*(buf.as_ptr() as *const TOKEN_USER);
        let mut name = [0u16; 256];
        let mut name_len = name.len() as u32;
        let mut domain = [0u16; 256];
        let mut domain_len = domain.len() as u32;
        let mut sid_type = SID_NAME_USE(0);
        let ok = LookupAccountSidW(
            None,
            user.User.Sid,
            Some(PWSTR(name.as_mut_ptr())),
            &mut name_len,
            Some(PWSTR(domain.as_mut_ptr())),
            &mut domain_len,
            &mut sid_type
        ).is_ok();
        let result = if ok {
            let name = OsString::from_wide(&name[..name_len as usize]).to_string_lossy().to_string();
            let domain = OsString::from_wide(&domain[..domain_len as usize]).to_string_lossy().to_string();
            Some(format!("{}\\{}", domain, name))
        } else {
            None
        };
        CloseHandle(token).ok();
        CloseHandle(handle).ok();
        return result;
    }
}

#[allow(non_snake_case)]
fn get_process_session_id(_pid: u32) -> Option<u32> {
    None
}

// Helper para obter prioridade
fn get_process_priority(pid: u32) -> Option<i32> {
    unsafe {
        let handle = open_process(pid)?;
        let prio = GetPriorityClass(handle);
        CloseHandle(handle).ok();
        if prio != 0 { Some(prio as i32) } else { None }
    }
}

// Helper para obter info de memória
fn get_process_memory_info(pid: u32) -> (u32, u64) {
    unsafe {
        if let Some(handle) = open_process(pid) {
            let mut mem_counters = PROCESS_MEMORY_COUNTERS::default();
            if K32GetProcessMemoryInfo(handle, &mut mem_counters, std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32).as_bool() {
                CloseHandle(handle).ok();
                return (mem_counters.PageFaultCount, mem_counters.PeakWorkingSetSize as u64 / 1024);
            } else {
                CloseHandle(handle).ok();
                return (0, 0);
            }
        }
    }
    (0, 0)
}

// Helper para obter IO
fn get_process_io(pid: u32) -> (Option<u64>, Option<u64>, Option<u64>, Option<u64>) {
    unsafe {
        if let Some(handle) = open_process(pid) {
            let mut io = IO_COUNTERS::default();
            if GetProcessIoCounters(handle, &mut io).is_ok() {
                CloseHandle(handle).ok();
                return (Some(io.ReadTransferCount), Some(io.WriteTransferCount), Some(io.ReadOperationCount), Some(io.WriteOperationCount));
            } else {
                CloseHandle(handle).ok();
                return (None, None, None, None);
            }
        }
    }
    (None, None, None, None)
}

// Módulo para informações de processos e threads

use serde::Serialize;
// use std::ffi::c_void;
use sysinfo::System;

#[derive(Serialize, Debug, Clone)]
pub struct ThreadInfo {
    pub tid: u32,
    pub base_priority: i32,
    pub delta_priority: i32,
    pub start_address: u64,
    pub state: String,
    pub wait_reason: String,
    pub context_switches: Option<u64>,
    pub user_time_ms: Option<u64>,
    pub kernel_time_ms: Option<u64>,
}

#[derive(Serialize, Debug, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub exe_path: Option<String>,
    pub status: String,
    pub username: String,
    pub cpu: f32,
    pub memory_kb: u64,
    pub memory_percent: f32,
    pub arch: String,
    pub description: String,
    pub page_faults: u32,
    pub peak_working_set_kb: u64,
    pub working_set_kb: u64,
    pub pagefile_kb: u64,
    pub io_read_bytes: Option<u64>,
    pub io_write_bytes: Option<u64>,
    pub io_read_ops: Option<u64>,
    pub io_write_ops: Option<u64>,
    pub handle_count: Option<u32>,
    pub thread_count: Option<u32>,
    pub parent_pid: Option<u32>,
    pub priority: Option<i32>,
    pub creation_time: Option<u64>,
    pub session_id: Option<u32>,
    pub command_line: Option<String>,
    pub environment: Option<Vec<String>>,
    pub threads: Vec<ThreadInfo>,
    pub open_resources: Option<Vec<String>>, // arquivos, mutexes, sockets, etc
}

pub async fn list_processes() -> Result<Vec<ProcessInfo>, anyhow::Error> {
    use std::time::Duration;
    use tokio::task;
    // Executa refresh e sleep em thread separada para não travar o servidor
    let (sys, total_memory) = task::spawn_blocking(|| {
        let mut sys = System::new_all();
        sys.refresh_all();
        std::thread::sleep(Duration::from_millis(1000));
        sys.refresh_all();
        let total_memory = sys.total_memory();
        (sys, total_memory)
    }).await.unwrap();
    let mut processes = Vec::new();
    for (pid, proc_) in sys.processes() {
        let pid_u32 = pid.as_u32();
        let name = proc_.name().to_string_lossy().to_string();
        let exe_path = proc_.exe().map(|p| p.to_string_lossy().to_string());
        let status = format!("{:?}", proc_.status());
        // Protege contra travamentos ao obter username
        let username = match std::panic::catch_unwind(|| {
            get_process_username(pid_u32)
        }).ok().flatten() {
            Some(u) => u,
            None => "?".to_string(),
        };
        let cpu = proc_.cpu_usage();
        let memory_kb = proc_.memory();
        let memory_percent = if total_memory > 0 {
            (memory_kb as f32 / total_memory as f32) * 100.0
        } else {
            0.0
        };
        let arch = if cfg!(target_pointer_width = "64") { "x64" } else { "x86" }.to_string();
        let description = String::new();
        let (page_faults, peak_working_set_kb) = get_process_memory_info(pid_u32);
        let working_set_kb = memory_kb;
        let pagefile_kb = 0;
        let (handle_count_raw, open_resources_raw) = get_process_handles_and_resources(pid_u32);
        let handle_count = Some(handle_count_raw.unwrap_or(0));
        // Garante que open_resources nunca seja null, sempre um vetor (mesmo vazio)
        let open_resources = Some(open_resources_raw.unwrap_or_else(|| Vec::new()));
        let threads_vec = get_process_threads(pid_u32);
        let thread_count = match proc_.tasks().map(|tasks| tasks.len() as u32) {
            Some(n) if n > 0 => Some(n),
            _ => Some(threads_vec.len() as u32),
        };
        let parent_pid = proc_.parent().map(|p| p.as_u32());
        let priority = get_process_priority(pid_u32);
        let creation_time = Some(proc_.start_time());
        let session_id = get_process_session_id(pid_u32);
        let command_line = Some(proc_.cmd().iter().map(|s| s.to_string_lossy()).collect::<Vec<_>>().join(" "));
        let environment = Some(proc_.environ().iter().map(|s| s.to_string_lossy().to_string()).collect());
        let threads = threads_vec;
        let (io_read_bytes, io_write_bytes, io_read_ops, io_write_ops) = get_process_io(pid_u32);
        processes.push(ProcessInfo {
            pid: pid_u32,
            name,
            exe_path,
            status,
            username,
            cpu,
            memory_kb,
            memory_percent,
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
            open_resources,
        });
    }
    Ok(processes)
}

pub mod handle;
