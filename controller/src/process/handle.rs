// Módulo para informações de handles abertos de processos
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct HandleInfo {
    pub handle: u16,
    pub object_type: String,
    pub name: String,
    pub access: u32,
}

use std::ffi::c_void;

#[repr(C)]
#[allow(non_snake_case)]
#[derive(Clone, Copy)]
pub struct SYSTEM_HANDLE {
    pub ProcessId: u32,
    pub ObjectTypeNumber: u8,
    pub Flags: u8,
    pub Handle: u16,
    pub Object: usize,
    pub GrantedAccess: u32,
}

#[repr(C)]
#[allow(non_snake_case)]
pub struct SYSTEM_HANDLE_INFORMATION {
    pub HandleCount: u32,
    pub Handles: [SYSTEM_HANDLE; 1],
}

#[link(name = "ntdll")]
extern "system" {
    pub fn NtQuerySystemInformation(
        SystemInformationClass: u32,
        SystemInformation: *mut c_void,
        SystemInformationLength: u32,
        ReturnLength: *mut u32,
    ) -> i32;
}

pub async fn list_process_handles(pid: u32) -> Result<Vec<HandleInfo>, anyhow::Error> {
    // Executa em thread separada para não travar o async
    let handles = tokio::task::spawn_blocking(move || {
        const SYSTEM_HANDLE_INFORMATION_CLASS: u32 = 16;
        let mut size = 0x10000;
        let mut result = Vec::new();
        loop {
            let mut buffer = vec![0u8; size];
            let mut needed = 0u32;
            let status = unsafe {
                NtQuerySystemInformation(
                    SYSTEM_HANDLE_INFORMATION_CLASS,
                    buffer.as_mut_ptr() as *mut _,
                    size as u32,
                    &mut needed,
                )
            };
            if status == 0 {
                unsafe {
                    let handle_info = &*(buffer.as_ptr() as *const SYSTEM_HANDLE_INFORMATION);
                    let count = handle_info.HandleCount as usize;
                    let handles_ptr = &handle_info.Handles as *const SYSTEM_HANDLE;
                    for i in 0..count {
                        let h = &*handles_ptr.add(i);
                        if h.ProcessId == pid {
                            result.push(HandleInfo {
                                handle: h.Handle,
                                object_type: format!("{}", h.ObjectTypeNumber),
                                name: String::new(),
                                access: h.GrantedAccess,
                            });
                        }
                    }
                }
                break;
            } else if status == 0xC0000004u32 as i32 { // STATUS_INFO_LENGTH_MISMATCH
                size *= 2;
                continue;
            } else {
                break;
            }
        }
        result
    }).await?;
    Ok(handles)
}
