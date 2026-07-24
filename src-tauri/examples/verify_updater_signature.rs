use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};
use serde_json::Value;
use std::{env, fs, path::Path};

fn decode_wrapped_text(value: &str, label: &str) -> Result<String, String> {
    let decoded = STANDARD
        .decode(value.trim())
        .map_err(|_| format!("{label} is not valid base64."))?;
    String::from_utf8(decoded).map_err(|_| format!("{label} is not valid UTF-8 text."))
}

fn updater_public_key(config_path: &Path) -> Result<PublicKey, String> {
    let config: Value = serde_json::from_slice(
        &fs::read(config_path).map_err(|_| "Unable to read tauri.conf.json.".to_string())?,
    )
    .map_err(|_| "tauri.conf.json is not valid JSON.".to_string())?;
    let wrapped_key = config
        .pointer("/plugins/updater/pubkey")
        .and_then(Value::as_str)
        .ok_or_else(|| "The updater public key is missing from tauri.conf.json.".to_string())?;
    let key_text = decode_wrapped_text(wrapped_key, "Updater public key")?;
    PublicKey::decode(&key_text).map_err(|error| format!("Invalid updater public key: {error}"))
}

fn run() -> Result<(), String> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments.len() != 3 {
        return Err(
            "Usage: verify_updater_signature <tauri.conf.json> <package> <package.sig>".to_string(),
        );
    }

    let public_key = updater_public_key(Path::new(&arguments[0]))?;
    let package =
        fs::read(&arguments[1]).map_err(|_| "Unable to read the updater package.".to_string())?;
    let wrapped_signature = fs::read_to_string(&arguments[2])
        .map_err(|_| "Unable to read the updater signature.".to_string())?;
    let signature_text = decode_wrapped_text(&wrapped_signature, "Updater signature")?;
    let signature = Signature::decode(&signature_text)
        .map_err(|error| format!("Invalid updater signature: {error}"))?;

    public_key
        .verify(&package, &signature, false)
        .map_err(|error| format!("Updater signature verification failed: {error}"))
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
    println!("Updater signature verified.");
}
