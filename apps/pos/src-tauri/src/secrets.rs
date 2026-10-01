use keyring::Entry;

// Service name cố định cho mọi account (refresh-token, device-id, ...) — xem
// apps/pos/src/lib/auth/secret-store.ts cho danh sách account đang dùng.
const SERVICE: &str = "com.seafoodpos.app";

fn validate_account(account: &str) -> Result<(), String> {
    match account {
        "refresh-token" | "device-id" => Ok(()),
        _ => Err("Tên thông tin xác thực không được phép".to_string()),
    }
}

fn entry_for(account: &str) -> Result<Entry, String> {
    validate_account(account)?;
    Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_secret(account: String) -> Result<Option<String>, String> {
    let entry = entry_for(&account)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_secret(account: String, value: String) -> Result<(), String> {
    let entry = entry_for(&account)?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_secret(account: String) -> Result<(), String> {
    let entry = entry_for(&account)?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
