// Animasy: janela própria (WebView2) em volta do mesmo app web. Diálogos de arquivo nativos, janela lembrada.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Animasy");
}
