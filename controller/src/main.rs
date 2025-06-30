mod system;
mod process;
mod fs;
use axum::{routing::get, Router, Json, extract::Path};
// use std::collections::HashMap;

// --- Endpoints delegando para módulos ---
async fn list_partitions() -> axum::response::Result<Json<Vec<fs::PartitionInfo>>, axum::http::StatusCode> {
    match fs::list_partitions().await {
        Ok(partitions) => Ok(Json(partitions)),
        Err(_) => Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn list_processes() -> axum::response::Result<Json<Vec<process::ProcessInfo>>, axum::http::StatusCode> {
    match process::list_processes().await {
        Ok(processes) => Ok(Json(processes)),
        Err(_) => Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn get_system_info() -> axum::response::Result<Json<system::SystemInfo>, axum::http::StatusCode> {
    match system::get_system_info().await {
        Ok(info) => Ok(Json(info)),
        Err(_) => Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn list_process_handles(Path(pid): Path<u32>) -> axum::response::Result<Json<Vec<process::handle::HandleInfo>>, axum::http::StatusCode> {
    match process::handle::list_process_handles(pid).await {
        Ok(handles) => Ok(Json(handles)),
        Err(_) => Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

// --- Função principal: inicializa o servidor HTTP ---
#[tokio::main]
async fn main() {
    std::env::set_var("RUST_BACKTRACE", "1");
    let app = Router::new()
        .route("/api/processes", get(list_processes))
        .route("/api/system", get(get_system_info))
        .route("/api/filesystem/partitions", get(list_partitions))
        .route("/api/processes/{pid}/handles", get(list_process_handles));
    let addr: std::net::SocketAddr = "[::]:3001".parse().unwrap();
    println!("API rodando em http://localhost:3001/api/");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app.into_make_service()).await.unwrap();
}
