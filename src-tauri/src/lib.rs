mod search;
mod tools;
mod mcp;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager, WindowEvent,
};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

const WINDOW_STATE_KEY: &str = "window-state";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
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
                        if let Some(window) = app.get_webview_window("main") {
                            if let Ok(store) = app.store("window-state.json") {
                                let position = window.outer_position().unwrap_or_default();
                                let size = window.outer_size().unwrap_or_default();
                                let state = WindowState {
                                    x: position.x,
                                    y: position.y,
                                    width: size.width,
                                    height: size.height,
                                };
                                store.set(WINDOW_STATE_KEY, serde_json::to_value(&state).unwrap());
                                let _ = store.save();
                            }
                        }
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
                if let Ok(store) = app.store("window-state.json") {
                    if let Some(state_value) = store.get(WINDOW_STATE_KEY) {
                        if let Ok(state) = serde_json::from_value::<WindowState>(state_value.clone()) {
                            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                                width: state.width.max(1280),
                                height: state.height.max(800),
                            }));
                            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                                x: state.x,
                                y: state.y,
                            }));
                        }
                    }
                }

                let window_clone = window.clone();
                let app_handle_for_close = app.handle().clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        
                        if let Ok(store) = app_handle_for_close.store("window-state.json") {
                            let position = window_clone.outer_position().unwrap_or_default();
                            let size = window_clone.outer_size().unwrap_or_default();
                            let state = WindowState {
                                x: position.x,
                                y: position.y,
                                width: size.width,
                                height: size.height,
                            };
                            store.set(WINDOW_STATE_KEY, serde_json::to_value(&state).unwrap());
                            let _ = store.save();
                        }
                        
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
                if let Some(window) = app_handle_for_exit.get_webview_window("main") {
                    if let Ok(store) = app_handle_for_exit.store("window-state.json") {
                        let position = window.outer_position().unwrap_or_default();
                        let size = window.outer_size().unwrap_or_default();
                        let state = WindowState {
                            x: position.x,
                            y: position.y,
                            width: size.width,
                            height: size.height,
                        };
                        store.set(WINDOW_STATE_KEY, serde_json::to_value(&state).unwrap());
                        let _ = store.save();
                    }
                }
                app_handle_for_exit.exit(0);
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
            mcp::commands::mcp_check_duplicate,
            mcp::commands::mcp_add_server,
            mcp::commands::mcp_remove_server,
            mcp::commands::mcp_connect_server,
            mcp::commands::mcp_disconnect_server,
            mcp::commands::mcp_list_servers,
            mcp::commands::mcp_list_tools,
            mcp::commands::mcp_call_tool,
            mcp::commands::mcp_get_server_configs,
            mcp::commands::mcp_save_configs,
            mcp::commands::mcp_load_configs,
            mcp::commands::mcp_get_server_stderr,
            mcp::commands::mcp_clear_server_stderr,
            mcp::commands::mcp_check_health,
            mcp::commands::mcp_get_resource_usage
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
