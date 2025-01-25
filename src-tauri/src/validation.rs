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

fn validate_shortcut(name: &str, shortcut: &Shortcut) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    // Only restrict single keys without modifiers
    if shortcut.key.len() == 1
        && shortcut.key.chars().next().unwrap().is_ascii_alphanumeric()
        && !shortcut.ctrl
        && !shortcut.alt
        && !shortcut.shift
        && !shortcut.meta
    {
        errors.push(ValidationError {
            component: format!("shortcuts.{}.key", name),
            message: format!(
                "Single key '{}' without modifiers may interfere with terminal applications. Please add Ctrl, Alt, Shift, or Meta modifier.",
                shortcut.key
            ),
        });
    }

    errors
}

fn validate_shortcuts(shortcuts: &KeyboardShortcuts) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    // Validate each shortcut
    errors.extend(validate_shortcut("new_tab", &shortcuts.new_tab));
    errors.extend(validate_shortcut("close_tab", &shortcuts.close_tab));
    errors.extend(validate_shortcut(
        "split_vertical",
        &shortcuts.split_vertical,
    ));
    errors.extend(validate_shortcut(
        "split_horizontal",
        &shortcuts.split_horizontal,
    ));
    errors.extend(validate_shortcut(
        "focus_next_pane",
        &shortcuts.focus_next_pane,
    ));
    errors.extend(validate_shortcut(
        "focus_previous_pane",
        &shortcuts.focus_previous_pane,
    ));
    errors.extend(validate_shortcut("close_pane", &shortcuts.close_pane));
    errors.extend(validate_shortcut("reload_config", &shortcuts.reload_config));

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
