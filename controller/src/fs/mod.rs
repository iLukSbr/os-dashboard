use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use tokio::task;

// FFI para sistema de arquivos
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

// Função para listar partições
pub async fn list_partitions() -> Result<Vec<PartitionInfo>, Box<dyn std::error::Error + Send + Sync>> {
    let partitions = task::spawn_blocking(|| unsafe {
        let mut result = Vec::new();
        let drives = GetLogicalDrives();
        for i in 0..26 {
            if (drives & (1 << i)) != 0 {
                let letter = (b'A' + i as u8) as char;
                let path = format!("{}:\\", letter);
                let wpath: Vec<u16> = OsStr::new(&path).encode_wide().chain(Some(0)).collect();
                let drive_type = GetDriveTypeW(wpath.as_ptr());
                if drive_type < 2 { continue; }
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
    Ok(partitions)
}

use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct PartitionInfo {
    pub name: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub percent_used: f32,
}

#[derive(Serialize, Debug, Clone)]
pub struct FileInfo {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub readonly: bool,
    pub hidden: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct DiskInfo {
    pub name: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub percent_used: f32,
    pub file_system: String,
    pub is_system: bool,
    pub has_pagefile: bool,
    pub disk_type: String,
    pub read_bytes: u64,
    pub write_bytes: u64,
    pub transfer_bytes: u64,
}
