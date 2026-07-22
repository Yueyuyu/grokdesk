mod grok_bridge;
mod runtime_extensions;
mod task_exchange;
mod workspace;
mod workspace_terminal;

use tauri::Manager;

use grok_bridge::{
    cancel_acp_turn, fetch_grok_subscription, install_grok_cli, open_grok_subscription,
    probe_runtime, respond_to_client_request, send_acp_prompt, start_acp_session,
    start_oauth_login, stop_acp_session, GrokBridge,
};
use runtime_extensions::{
    add_grok_mcp_server, diagnose_grok_mcp_server, install_grok_plugin, list_grok_mcp_servers,
    list_grok_plugins, refresh_grok_plugin_marketplaces, remove_grok_mcp_server,
    set_grok_plugin_enabled, uninstall_grok_plugin, update_grok_plugin,
};
use task_exchange::{read_task_exchange_file, write_task_exchange_file};
use workspace::{
    discard_workspace_change, get_workspace_diff, inspect_workspace, stage_workspace_change,
    unstage_workspace_change,
};
use workspace_terminal::{cancel_workspace_command, run_workspace_command, WorkspaceTerminal};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(GrokBridge::default())
        .manage(WorkspaceTerminal::default())
        .invoke_handler(tauri::generate_handler![
            probe_runtime,
            start_acp_session,
            send_acp_prompt,
            cancel_acp_turn,
            stop_acp_session,
            start_oauth_login,
            install_grok_cli,
            list_grok_plugins,
            install_grok_plugin,
            set_grok_plugin_enabled,
            update_grok_plugin,
            uninstall_grok_plugin,
            refresh_grok_plugin_marketplaces,
            list_grok_mcp_servers,
            add_grok_mcp_server,
            remove_grok_mcp_server,
            diagnose_grok_mcp_server,
            fetch_grok_subscription,
            open_grok_subscription,
            respond_to_client_request,
            read_task_exchange_file,
            write_task_exchange_file,
            inspect_workspace,
            get_workspace_diff,
            stage_workspace_change,
            unstage_workspace_change,
            discard_workspace_change,
            run_workspace_command,
            cancel_workspace_command,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run GrokDesk");
}
