// Xem src/secrets.rs: các lệnh get_secret/set_secret/delete_secret được
// TauriSecretStore (apps/pos/src/lib/auth/secret-store.ts) gọi qua invoke().
mod secrets;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.set_focus() {
                    eprintln!("Không thể đưa cửa sổ Seafood POS đang chạy lên trước: {error}");
                }
            }
        }))
        .invoke_handler(tauri::generate_handler![
            secrets::get_secret,
            secrets::set_secret,
            secrets::delete_secret,
        ])
        .run(tauri::generate_context!())
        .expect("lỗi khi khởi chạy ứng dụng Tauri");
}
