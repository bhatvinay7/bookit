use tonic::transport::Channel;

use crate::locking::slot_locking_service_client::SlotLockingServiceClient;
use crate::locking::{LockSlotRequest, UnlockSlotRequest};

/// The gateway owns the lock itself. These RPCs are intentionally post-operation
/// notifications to the downstream seat-locking processor.
#[derive(Clone)]
pub struct GrpcLockClient {
    client: SlotLockingServiceClient<Channel>,
}

impl GrpcLockClient {
    pub async fn connect(url: String) -> Result<Self, tonic::transport::Error> {
        let endpoint = tonic::transport::Endpoint::from_shared(url)?;
        let client = SlotLockingServiceClient::new(endpoint.connect_lazy());
        Ok(Self { client })
    }

    pub async fn lock_slot(
        &self,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        seat_indices: Vec<i32>,
        total_seat_count: i32,
        user_id: i32,
    ) -> Result<(), tonic::Status> {
        self.client
            .clone()
            .lock_slot(tonic::Request::new(LockSlotRequest {
                showtime_id,
                seat_ids,
                user_id,
                total_seat_count,
                seat_indices,
            }))
            .await
            .map(|_| ())
    }

    pub async fn unlock_slot(
        &self,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        seat_indices: Vec<i32>,
        total_seat_count: i32,
        user_id: i32,
    ) -> Result<(), tonic::Status> {
        self.client
            .clone()
            .unlock_slot(tonic::Request::new(UnlockSlotRequest {
                showtime_id,
                seat_ids,
                user_id,
                total_seat_count,
                seat_indices,
            }))
            .await
            .map(|_| ())
    }
}
