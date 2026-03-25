mod search;
mod tools;
mod models;
mod memory;
mod commands;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager, WindowEvent,
};
use commands::{MemoryState, SessionState};
use memory::{MemoryStorage, MemoryEvolutionManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("nexus-ai-assistant");
    
    log::info!("========================================");
    log::info!("[MemorySystem] 正在初始化认知记忆系统...");
    log::info!("[MemorySystem] 数据存储位置: {:?}", app_data_dir);
    
    let db_path = app_data_dir.join("memory.db");
    log::info!("[MemorySystem] 数据库文件: {:?}", db_path);
    
    let storage = MemoryStorage::new(app_data_dir).expect("Failed to initialize memory storage");
    log::info!("[MemorySystem] 数据库初始化成功");
    
    let memory_state = MemoryState::new(storage.clone(), db_path);
    let session_state = SessionState::new(storage);
    log::info!("[MemorySystem] 认知记忆系统初始化完成");
    log::info!("========================================");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(memory_state.clone())
        .manage(session_state)
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let app_handle = app.handle().clone();
            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let window = app.get_webview_window("main");
            if let Some(window) = window {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.emit("close-requested", ());
                    }
                });
            }

            let app_handle_for_hide = app_handle.clone();
            let _ = app.listen("hide-window", move |_event| {
                if let Some(window) = app_handle_for_hide.get_webview_window("main") {
                    let _ = window.hide();
                }
            });

            let app_handle_for_exit = app_handle.clone();
            let _ = app.listen("exit-app", move |_event| {
                app_handle_for_exit.exit(0);
            });

            let evolution_manager = MemoryEvolutionManager::new(memory_state.storage.blocking_lock().clone());
            tauri::async_runtime::spawn(async move {
                log::info!("[MemoryEvolution] 启动时执行演化周期...");
                match evolution_manager.run_evolution_cycle().await {
                    Ok((decay_result, prune_result)) => {
                        log::info!("[MemoryEvolution] 演化周期完成: 衰减处理 {} 条, 标记不活跃 {} 条, 删除 {} 条",
                            decay_result.processed, prune_result.marked_inactive, prune_result.deleted);
                    }
                    Err(e) => {
                        log::error!("[MemoryEvolution] 演化周期执行失败: {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search::search,
            tools::fetch::fetch_url,
            tools::filesystem::read_file,
            tools::filesystem::write_file,
            tools::filesystem::list_directory,
            tools::filesystem::delete_file,
            tools::filesystem::create_directory,
            tools::filesystem::file_exists,
            tools::filesystem::get_file_info,
            tools::shell::execute_command,
            tools::shell::execute_powershell,
            tools::shell::get_system_info,
            commands::memory::retrieve_memories,
            commands::memory::add_memory,
            commands::memory::get_all_memories,
            commands::memory::get_memories_by_type,
            commands::memory::update_task_status,
            commands::memory::delete_memory,
            commands::memory::prune_memories,
            commands::memory::get_memory_stats,
            commands::memory::initialize_embedding_service,
            commands::memory::get_embedding_dimension,
            commands::memory::reinforce_memories,
            commands::memory::decay_memories,
            commands::memory::prune_memories_v2,
            commands::memory::run_evolution_cycle,
            commands::memory::get_evolution_stats,
            commands::memory::should_extract_memories,
            commands::memory::get_pending_candidates,
            commands::memory::accept_candidate,
            commands::memory::reject_candidate,
            commands::memory::accept_all_candidates,
            commands::memory::add_candidate_memory,
            commands::memory::clear_old_candidates,
            commands::memory::get_embedding_provider,
            commands::memory::recompute_all_embeddings,
            commands::memory::get_stored_embedding_dimension,
            commands::memory::clear_all_embeddings,
            commands::memory::get_available_embedding_models,
            commands::memory::initialize_embedding_with_model,
            commands::memory::dedup_candidate,
            commands::memory::dedup_accept,
            commands::memory::execute_dedup_pipeline,
            commands::memory::run_memory_evolution,
            commands::session::save_session,
            commands::session::load_sessions,
            commands::session::delete_session,
            commands::session::save_messages,
            commands::session::load_messages,
            commands::session::save_folder,
            commands::session::load_folders,
            commands::session::delete_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
