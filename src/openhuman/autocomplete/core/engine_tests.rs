use super::is_low_quality_suggestion;

#[test]
fn low_quality_rejects_too_short() {
    assert!(is_low_quality_suggestion("", ""));
    assert!(is_low_quality_suggestion("a", "hello "));
}

#[test]
fn low_quality_rejects_pure_punct() {
    assert!(is_low_quality_suggestion("...", "hello"));
    assert!(is_low_quality_suggestion("  -- ", "hello"));
}

#[test]
fn low_quality_rejects_echo_of_tail() {
    assert!(is_low_quality_suggestion("world", "hello world"));
}

#[test]
fn low_quality_accepts_new_content() {
    assert!(!is_low_quality_suggestion(" world", "hello"));
    assert!(!is_low_quality_suggestion("tomorrow", "see you "));
}
