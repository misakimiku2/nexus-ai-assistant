mod search;
mod tools;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager, WindowEvent,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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
            tools::shell::get_system_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
