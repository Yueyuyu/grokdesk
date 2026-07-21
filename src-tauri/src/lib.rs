mod grok_bridge;
mod workspace;

use tauri::Manager;

use grok_bridge::{
    cancel_acp_turn, fetch_grok_subscription, install_grok_cli, open_grok_subscription,
    probe_runtime, respond_to_client_request, send_acp_prompt, start_acp_session,
    start_oauth_login, stop_acp_session, GrokBridge,
};
use workspace::{
    discard_workspace_change, get_workspace_diff, inspect_workspace, stage_workspace_change,
    unstage_workspace_change,
};

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
        .invoke_handler(tauri::generate_handler![
            probe_runtime,
            start_acp_session,
            send_acp_prompt,
            cancel_acp_turn,
            stop_acp_session,
            start_oauth_login,
            install_grok_cli,
            fetch_grok_subscription,
            open_grok_subscription,
            respond_to_client_request,
            inspect_workspace,
            get_workspace_diff,
            stage_workspace_change,
            unstage_workspace_change,
            discard_workspace_change,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run GrokDesk");
}
