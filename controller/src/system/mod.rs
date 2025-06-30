// FFI para DeviceIoControl e IOCTL_DISK_PERFORMANCE
#[cfg(windows)]
mod diskio {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    use std::mem::size_of;
    use std::os::raw::c_void;

    #[repr(C)]
    #[allow(non_snake_case)]
    #[derive(Debug, Default, Clone, Copy)]
    pub struct DISK_PERFORMANCE {
        pub BytesRead: i64,
        pub BytesWritten: i64,
        pub ReadTime: i64,
        pub WriteTime: i64,
        pub IdleTime: i64,
        pub ReadCount: u32,
        pub WriteCount: u32,
        pub QueueDepth: u32,
        pub SplitCount: u32,
        pub QueryTime: i64,
        pub StorageDeviceNumber: u32,
        pub StorageManagerName: [u16; 8],
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateFileW(
            lpFileName: *const u16,
            dwDesiredAccess: u32,
            dwShareMode: u32,
            lpSecurityAttributes: *mut c_void,
            dwCreationDisposition: u32,
            dwFlagsAndAttributes: u32,
            hTemplateFile: *mut c_void,
        ) -> *mut c_void;
        fn DeviceIoControl(
            hDevice: *mut c_void,
            dwIoControlCode: u32,
            lpInBuffer: *mut c_void,
            nInBufferSize: u32,
            lpOutBuffer: *mut c_void,
            nOutBufferSize: u32,
            lpBytesReturned: *mut u32,
            lpOverlapped: *mut c_void,
        ) -> i32;
        fn CloseHandle(hObject: *mut c_void) -> i32;
    }

    const GENERIC_READ: u32 = 0x80000000;
    const FILE_SHARE_READ: u32 = 0x00000001;
    const FILE_SHARE_WRITE: u32 = 0x00000002;
    const OPEN_EXISTING: u32 = 3;
    const IOCTL_DISK_PERFORMANCE: u32 = 0x70020;

    pub fn get_disk_performance(drive_letter: &str) -> Option<(u64, u64)> {
        let device = format!("\\\\.\\{}:", drive_letter.trim_end_matches(':'));
        let wdevice: Vec<u16> = OsStr::new(&device).encode_wide().chain(Some(0)).collect();
        unsafe {
            let handle = CreateFileW(
                wdevice.as_ptr(),
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                null_mut(),
                OPEN_EXISTING,
                0,
                null_mut(),
            );
            if handle.is_null() {
                return None;
            }
            let mut perf = DISK_PERFORMANCE::default();
            let mut bytes_returned = 0u32;
            let ok = DeviceIoControl(
                handle,
                IOCTL_DISK_PERFORMANCE,
                null_mut(),
                0,
                &mut perf as *mut _ as *mut c_void,
                size_of::<DISK_PERFORMANCE>() as u32,
                &mut bytes_returned,
                null_mut(),
            );
            CloseHandle(handle);
            if ok != 0 {
                Some((perf.BytesRead as u64, perf.BytesWritten as u64))
            } else {
                None
            }
        }
    }
}
// Módulo para informações do sistema (memória, CPU, uptime, discos, etc)

use crate::fs::DiskInfo;
use serde::Serialize;
use std::os::windows::ffi::OsStrExt;
use tokio::task;

#[derive(Serialize, Debug, Clone)]
pub struct SystemInfo {
    pub cpu_total: String,
    pub cpu_per_core: Vec<f32>,
    pub memory_total_mb: u64,
    pub memory_used_mb: u64,
    pub memory_free_mb: u64,
    pub memory_percent: String,
    pub uptime: String,
    pub uptime_secs: u64,
    pub process_count: usize,
    pub cpu_base_speed_mhz: u64,
    pub cpu_logical_processors: u32,
    pub cpu_vendor: String,
    pub cpu_brand: String,
    pub cpu_physical_cores: u32,
    pub disks: Vec<super::fs::DiskInfo>,
    pub os_name: String,
    pub os_version: String,
    pub os_build: String,
    pub hostname: String,
    pub boot_time: u64,
}

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



fn get_volume_file_system(path: &str) -> Option<String> {
    use std::ptr::null_mut;
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
    let mut fs_buf = [0u16; 32];
    let wpath: Vec<u16> = std::ffi::OsStr::new(path).encode_wide().chain(Some(0)).collect();
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
    path.to_uppercase().starts_with(r"C:\")
}

fn has_pagefile_on_drive(path: &str) -> bool {
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

fn get_disk_stats_wmi(drive_letter: &str) -> (u64, u64, u64) {
    // Tenta obter IO nativo via DeviceIoControl/IOCTL_DISK_PERFORMANCE
    #[cfg(windows)]
    {
        if let Some((read, write)) = crate::system::diskio::get_disk_performance(drive_letter) {
            if read > 0 || write > 0 {
                return (read, write, read + write);
            }
        }
    }
    // Se não for Windows ou falhar, retorna zero
    (0, 0, 0)
}

pub async fn get_system_info() -> Result<SystemInfo, anyhow::Error> {
    // Coleta de CPU, processos, boot time e IO de disco usando sysinfo e chrono
    use sysinfo::System;
    use chrono::Utc;
    let sysinfo = task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_all();
        std::thread::sleep(std::time::Duration::from_millis(100));
        sys.refresh_all();

        // CPU
        let cpu_per_core: Vec<f32> = sys.cpus().iter().map(|cpu| cpu.cpu_usage()).collect();
        let cpu_total_val = sys.global_cpu_usage();
        let cpu_total = format!("{:.1}%", cpu_total_val);
        // Processos
        let process_count = sys.processes().len();
        // CPU info extra
        let cpu_vendor = sys.cpus().get(0).map(|c| c.vendor_id().to_string()).unwrap_or_default();
        let cpu_brand = sys.cpus().get(0).map(|c| c.brand().to_string()).unwrap_or_default();
        let cpu_base_speed_mhz = sys.cpus().get(0).map(|c| c.frequency() as u64).unwrap_or(0);
        let cpu_logical_processors = sys.cpus().len() as u32;
        let cpu_physical_cores = System::physical_core_count().unwrap_or(cpu_logical_processors as usize) as u32;
        // Memória
        let memory_total_mb = sys.total_memory() / 1024;
        let memory_free_mb = sys.available_memory() / 1024;
        let memory_used_mb = memory_total_mb.saturating_sub(memory_free_mb);
        let memory_percent = if memory_total_mb > 0 {
            format!("{:.1}%", (memory_used_mb as f64 / memory_total_mb as f64) * 100.0)
        } else {
            "0.0%".to_string()
        };
        // Uptime
        let uptime_secs = System::uptime();
        let hours = uptime_secs / 3600;
        let mins = (uptime_secs % 3600) / 60;
        let uptime = format!("{}h {}m", hours, mins);
        // Boot time (UTC timestamp)
        let now = Utc::now().timestamp() as u64;
        let boot_time = now.saturating_sub(uptime_secs);
        // Hostname
        let hostname = System::host_name().unwrap_or_else(|| "Desconhecido".to_string());
        // Discos detalhados (abordagem FFI/WinAPI)
        let mut disks = Vec::new();
        let drives = unsafe { GetLogicalDrives() };
        for i in 0..26 {
            if (drives & (1 << i)) != 0 {
                let letter = (b'A' + i as u8) as char;
                let path = format!(r"{}:\", letter);
                let wpath: Vec<u16> = std::ffi::OsStr::new(&path).encode_wide().chain(Some(0)).collect();
                let drive_type = unsafe { GetDriveTypeW(wpath.as_ptr()) };
                if drive_type < 2 { continue; }
                let mut free = 0u64;
                let mut total = 0u64;
                let mut total_free = 0u64;
                let _ = unsafe { GetDiskFreeSpaceExW(wpath.as_ptr(), &mut free, &mut total, &mut total_free) };
                let file_system = get_volume_file_system(&path).unwrap_or_else(|| "Desconhecido".to_string());
                let is_system = is_system_drive(&path);
                let has_pagefile = has_pagefile_on_drive(&path);
                let disk_type = get_disk_type(drive_type);
                let (read_bytes, write_bytes, transfer_bytes) = get_disk_stats_wmi(&letter.to_string());
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
        // OS info detalhado
        let os_version = {
            #[repr(C)]
            #[allow(non_snake_case)]
            struct OSVERSIONINFOW {
                dwOSVersionInfoSize: u32,
                dwMajorVersion: u32,
                dwMinorVersion: u32,
                dwBuildNumber: u32,
                dwPlatformId: u32,
                szCSDVersion: [u16; 128],
            }
            extern "system" {
                fn GetVersionExW(lpVersionInformation: *mut OSVERSIONINFOW) -> i32;
            }
            let mut info = unsafe { std::mem::MaybeUninit::<OSVERSIONINFOW>::zeroed().assume_init() };
            info.dwOSVersionInfoSize = std::mem::size_of::<OSVERSIONINFOW>() as u32;
            if unsafe { GetVersionExW(&mut info) } != 0 {
                format!("{}.{}.{}", info.dwMajorVersion, info.dwMinorVersion, info.dwBuildNumber)
            } else {
                "Desconhecida".to_string()
            }
        };
        let os_build = "Windows".to_string();
        SystemInfo {
            cpu_total,
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
            cpu_physical_cores,
            disks,
            os_name: "Windows".to_string(),
            os_version,
            os_build,
            hostname,
            boot_time,
        }
    }).await?;
    Ok(sysinfo)
}
