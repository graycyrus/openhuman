//! Full local E2E round-trip tests for Signal protocol.
use std::collections::HashMap;

use tinyplace::signal::crypto::{ed25519_seed_to_x25519_keypair, generate_x25519_keypair};
use tinyplace::signal::keys::{generate_pre_keys, generate_signed_pre_key};
use tinyplace::signal::ratchet::{ratchet_decrypt, ratchet_encrypt};
use tinyplace::signal::store::{SessionState, SessionStore};
use tinyplace::signal::x3dh::{build_associated_data, x3dh_initiate, x3dh_respond, X3DHBundle};

use crate::openhuman::keyring::SecretStore;
use crate::openhuman::tinyplace::signal_store::FileSessionStore;

#[tokio::test]
async fn signal_e2e_round_trip_alice_bob() {
    let alice_dir = tempfile::tempdir().unwrap();
    let bob_dir = tempfile::tempdir().unwrap();
    let alice_seed = [1u8; 32];
    let bob_seed = [2u8; 32];
    let alice_identity = ed25519_seed_to_x25519_keypair(&alice_seed);
    let bob_identity = ed25519_seed_to_x25519_keypair(&bob_seed);
    let alice_ss = SecretStore::new(alice_dir.path(), true);
    let bob_ss = SecretStore::new(bob_dir.path(), true);
    let alice_store = FileSessionStore::new(
        alice_identity.clone(),
        alice_dir.path().join("signal"),
        alice_ss,
    )
    .await
    .unwrap();
    let bob_store =
        FileSessionStore::new(bob_identity.clone(), bob_dir.path().join("signal"), bob_ss)
            .await
            .unwrap();
    let bob_signer = tinyplace::LocalSigner::from_seed(&bob_seed).unwrap();
    let bob_spk = generate_signed_pre_key(&bob_signer as &dyn tinyplace::Signer, "spk_test")
        .await
        .unwrap();
    bob_store
        .store_signed_pre_key(bob_spk.clone())
        .await
        .unwrap();
    let bob_otpks = generate_pre_keys(&bob_signer as &dyn tinyplace::Signer, 0, 5)
        .await
        .unwrap();
    for pk in &bob_otpks {
        bob_store.store_pre_key(pk.clone()).await.unwrap();
    }
    let bob_bundle = X3DHBundle {
        identity_key: bob_identity.public_key,
        signed_pre_key_id: bob_spk.key_id.clone(),
        signed_pre_key: bob_spk.key_pair.public_key,
        one_time_pre_key_id: Some(bob_otpks[0].key_id.clone()),
        one_time_pre_key: Some(bob_otpks[0].key_pair.public_key),
    };
    let x3dh_result = x3dh_initiate(&alice_identity, &bob_bundle);
    let mut alice_session = x3dh_result.session;
    let ad = build_associated_data(&alice_identity.public_key, &bob_identity.public_key);
    let plaintext = b"Hello Bob, this is a secret message!";
    let ratchet_msg = ratchet_encrypt(&mut alice_session, plaintext, &ad).unwrap();
    alice_store
        .store_session("bob", alice_session.clone())
        .await
        .unwrap();
    let bob_otpk_pair = &bob_otpks[0];
    let mut bob_session = x3dh_respond(
        &bob_identity,
        &bob_spk.key_pair,
        &alice_identity.public_key,
        &x3dh_result.ephemeral_public_key,
        Some(&bob_otpk_pair.key_pair),
    );
    let ad_bob = build_associated_data(&alice_identity.public_key, &bob_identity.public_key);
    let decrypted = ratchet_decrypt(&mut bob_session, &ratchet_msg, &ad_bob).unwrap();
    assert_eq!(
        decrypted, plaintext,
        "decrypted plaintext must match original"
    );
    bob_store
        .store_session("alice", bob_session.clone())
        .await
        .unwrap();
    bob_store
        .remove_pre_key(&bob_otpks[0].key_id)
        .await
        .unwrap();
    let remaining = bob_store.all_pre_keys().await.unwrap();
    assert_eq!(remaining.len(), 4, "one-time pre-key should be consumed");
    let reply = b"Hello Alice, message received!";
    let reply_msg = ratchet_encrypt(&mut bob_session, reply, &ad_bob).unwrap();
    bob_store
        .store_session("alice", bob_session.clone())
        .await
        .unwrap();
    let mut alice_session = alice_store.session("bob").await.unwrap().unwrap();
    let decrypted_reply = ratchet_decrypt(&mut alice_session, &reply_msg, &ad).unwrap();
    assert_eq!(decrypted_reply, reply, "Alice must decrypt Bob's reply");
    alice_store
        .store_session("bob", alice_session)
        .await
        .unwrap();
    let mut alice_session = alice_store.session("bob").await.unwrap().unwrap();
    let mut messages = Vec::new();
    for i in 0..5 {
        let msg_text = format!("Message #{i} from Alice").into_bytes();
        let msg = ratchet_encrypt(&mut alice_session, &msg_text, &ad).unwrap();
        messages.push((msg, msg_text));
    }
    alice_store
        .store_session("bob", alice_session)
        .await
        .unwrap();
    let mut bob_session = bob_store.session("alice").await.unwrap().unwrap();
    for (msg, expected) in &messages {
        let decrypted = ratchet_decrypt(&mut bob_session, msg, &ad_bob).unwrap();
        assert_eq!(&decrypted, expected);
    }
    bob_store.store_session("alice", bob_session).await.unwrap();
}

#[test]
fn signal_e2e_no_plaintext_on_failure() {
    let identity = generate_x25519_keypair();
    let mut broken_session = SessionState {
        dh_send_key_pair: generate_x25519_keypair(),
        dh_recv_public_key: None,
        root_key: [0u8; 32],
        send_chain_key: None,
        recv_chain_key: None,
        send_message_number: 0,
        recv_message_number: 0,
        previous_chain_length: 0,
        skipped_keys: HashMap::new(),
    };
    let ad = build_associated_data(&identity.public_key, &[42u8; 32]);
    let result = ratchet_encrypt(&mut broken_session, b"secret", &ad);
    assert!(
        result.is_err(),
        "ratchet_encrypt MUST fail when DH ratchet cannot be performed"
    );
}

#[test]
fn associated_data_binds_both_identities() {
    let alice = [1u8; 32];
    let bob = [2u8; 32];
    let ad = build_associated_data(&alice, &bob);
    assert_eq!(ad.len(), 64);
    assert_eq!(&ad[..32], &alice);
    assert_eq!(&ad[32..], &bob);
    let ad_swapped = build_associated_data(&bob, &alice);
    assert_ne!(ad, ad_swapped);
}
