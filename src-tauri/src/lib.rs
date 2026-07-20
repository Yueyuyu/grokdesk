mod grok_bridge;

use grok_bridge::{
    cancel_acp_turn, probe_runtime, respond_to_client_request, send_acp_prompt, start_acp_session,
    start_oauth_login, stop_acp_session, GrokBridge,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(GrokBridge::default())
        .invoke_handler(tauri::generate_handler![
            probe_runtime,
            start_acp_session,
            send_acp_prompt,
            cancel_acp_turn,
            stop_acp_session,
            start_oauth_login,
            respond_to_client_request,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run GrokDesk");
}
