use super::*;

#[test]
fn show_actor_uses_one_based_indices_for_lock_free_admission() {
    let (sender, _receiver) = mpsc::channel(1);
    let actor = CachePaddedShowActor::new(sender, 3).unwrap();

    let index = actor.register_seat(101, 1).unwrap();
    assert_eq!(index, 0);
    assert!(actor.try_admit(index));
    assert!(!actor.try_admit(index));

    actor.clear_seat(101);
    assert!(actor.try_admit(index));
}

#[test]
fn show_actor_rejects_inconsistent_seat_metadata() {
    let (sender, _receiver) = mpsc::channel(1);
    let actor = CachePaddedShowActor::new(sender, 2).unwrap();

    assert_eq!(actor.register_seat(101, 1), Ok(0));
    assert!(actor.register_seat(101, 2).is_err());
    assert!(actor.register_seat(102, 1).is_err());
    assert!(actor.register_seat(103, 3).is_err());
    assert!(actor.validate_seat_count(3).is_err());
}

#[test]
fn concurrent_herd_has_only_one_winner_for_a_seat() {
    const CONTENDERS: usize = 256;

    let (sender, _receiver) = mpsc::channel(1);
    let actor = Arc::new(CachePaddedShowActor::new(sender, 1).unwrap());
    let start = Arc::new(std::sync::Barrier::new(CONTENDERS));
    let mut threads = Vec::with_capacity(CONTENDERS);

    for _ in 0..CONTENDERS {
        let actor = Arc::clone(&actor);
        let start = Arc::clone(&start);
        threads.push(std::thread::spawn(move || {
            let index = actor.register_seat(101, 1).unwrap();
            start.wait();
            actor.try_admit(index)
        }));
    }

    let winners = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .filter(|won| *won)
        .count();
    assert_eq!(winners, 1);
}

#[test]
fn idle_eviction_waits_for_in_flight_requests() {
    let (sender, _receiver) = mpsc::channel(1);
    let actor = Arc::new(CachePaddedShowActor::new(sender, 1).unwrap());
    let now = unix_now();
    actor.last_access.store(
        now.saturating_sub(ACTOR_IDLE_TTL.as_secs() + 1),
        Ordering::Release,
    );

    let request = actor.begin_request().unwrap();
    actor.last_access.store(
        now.saturating_sub(ACTOR_IDLE_TTL.as_secs() + 1),
        Ordering::Release,
    );
    assert!(!actor.try_begin_idle_eviction(now));
    assert!(!actor.closing.load(Ordering::Acquire));

    drop(request);
    actor.last_access.store(
        now.saturating_sub(ACTOR_IDLE_TTL.as_secs() + 1),
        Ordering::Release,
    );
    assert!(actor.try_begin_idle_eviction(now));
    assert!(actor.closing.load(Ordering::Acquire));
    assert!(actor.begin_request().is_err());
}
