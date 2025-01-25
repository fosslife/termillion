use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::config::{Config, KeyboardShortcuts, Shortcut};

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationError {
    pub component: String, // e.g., "shortcuts", "theme"
    pub message: String,
}

lazy_static! {
    static ref SAFE_KEYS: HashSet<&'static str> = {
        let mut s = HashSet::new();
        s.insert("t");  // new tab
        s.insert("w");  // close
        s.insert("r");  // reload
        s.insert("e");  // split
        s.insert("o");  // split other direction
        s.insert("[");  // prev
        s.insert("]");  // next
        s.insert("\\"); // additional splits
        s.insert("/");  // search (future)
        s
    };
}

impl Config {
    pub fn validate(&self) -> Vec<ValidationError> {
        let mut errors = Vec::new();

        // Validate shortcuts
        errors.extend(validate_shortcuts(&self.shortcuts));

        // Future: Add other validations
        // errors.extend(validate_theme(&self.theme));
        // errors.extend(validate_font(&self.font));

        errors
    }
}

fn validate_shortcut(name: &str, shortcut: &Shortcut) -> Option<ValidationError> {
    // Must use Ctrl+Shift
    if !shortcut.ctrl || !shortcut.shift {
        return Some(ValidationError {
            component: "shortcuts".into(),
            message: format!("Shortcut '{}' must use Ctrl+Shift combination", name),
        });
    }

    // Must not use Alt (reserved for terminal)
    if shortcut.alt {
        return Some(ValidationError {
            component: "shortcuts".into(),
            message: format!(
                "Shortcut '{}' must not use Alt (reserved for terminal)",
                name
            ),
        });
    }

    // Must be a safe key
    if !SAFE_KEYS.contains(shortcut.key.to_lowercase().as_str()) {
        return Some(ValidationError {
            component: "shortcuts".into(),
            message: format!(
                "Shortcut '{}' uses key '{}' which may interfere with terminal applications",
                name, shortcut.key
            ),
        });
    }

    None
}

fn validate_shortcuts(shortcuts: &KeyboardShortcuts) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    // Validate each shortcut
    if let Some(err) = validate_shortcut("new_tab", &shortcuts.new_tab) {
        errors.push(err);
    }
    if let Some(err) = validate_shortcut("close_tab", &shortcuts.close_tab) {
        errors.push(err);
    }
    if let Some(err) = validate_shortcut("split_vertical", &shortcuts.split_vertical) {
        errors.push(err);
    }
    if let Some(err) = validate_shortcut("split_horizontal", &shortcuts.split_horizontal) {
        errors.push(err);
    }
    if let Some(err) = validate_shortcut("focus_next_pane", &shortcuts.focus_next_pane) {
        errors.push(err);
    }
    if let Some(err) = validate_shortcut("focus_previous_pane", &shortcuts.focus_previous_pane) {
        errors.push(err);
    }
    if let Some(err) = validate_shortcut("close_pane", &shortcuts.close_pane) {
        errors.push(err);
    }
    if let Some(err) = validate_shortcut("reload_config", &shortcuts.reload_config) {
        errors.push(err);
    }

    // Check for conflicts
    let mut used_combinations = HashSet::new();
    let mut check_conflict = |name: &str, shortcut: &Shortcut| {
        let combo = format!(
            "{}{}{}{}{}",
            if shortcut.ctrl { "ctrl+" } else { "" },
            if shortcut.shift { "shift+" } else { "" },
            if shortcut.alt { "alt+" } else { "" },
            if shortcut.meta { "meta+" } else { "" },
            shortcut.key.to_lowercase()
        );

        if used_combinations.contains(&combo) {
            Some(ValidationError {
                component: "shortcuts".into(),
                message: format!("Shortcut '{}' conflicts with another shortcut", name),
            })
        } else {
            used_combinations.insert(combo);
            None
        }
    };

    // Check conflicts for all shortcuts
    if let Some(err) = check_conflict("new_tab", &shortcuts.new_tab) {
        errors.push(err);
    }
    if let Some(err) = check_conflict("close_tab", &shortcuts.close_tab) {
        errors.push(err);
    }
    if let Some(err) = check_conflict("split_vertical", &shortcuts.split_vertical) {
        errors.push(err);
    }
    if let Some(err) = check_conflict("split_horizontal", &shortcuts.split_horizontal) {
        errors.push(err);
    }
    if let Some(err) = check_conflict("focus_next_pane", &shortcuts.focus_next_pane) {
        errors.push(err);
    }
    if let Some(err) = check_conflict("focus_previous_pane", &shortcuts.focus_previous_pane) {
        errors.push(err);
    }
    if let Some(err) = check_conflict("close_pane", &shortcuts.close_pane) {
        errors.push(err);
    }
    if let Some(err) = check_conflict("reload_config", &shortcuts.reload_config) {
        errors.push(err);
    }

    errors
}
