use locking::LockSlotRequest;
use locking::slot_locking_service_client::SlotLockingServiceClient;
use tonic::transport::Channel;

pub mod locking {
    tonic::include_proto!("locking");
}

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
    ) -> Result<(bool, String, Vec<i32>, Vec<i32>), Box<dyn std::error::Error + Send + Sync>> {
        let mut client = self.client.clone();

        let request = tonic::Request::new(LockSlotRequest {
            showtime_id,
            seat_ids,
            user_id,
            total_seat_count,
            seat_indices,
        });

        match client.lock_slot(request).await {
            Ok(response) => {
                let inner = response.into_inner();
                Ok((
                    inner.success,
                    inner.message,
                    inner.locked_seat_ids,
                    inner.failed_seat_ids,
                ))
            }
            Err(e) => Err(Box::new(e)),
        }
    }

    pub async fn unlock_slot(
        &self,
        showtime_id: i32,
        seat_ids: Vec<i32>,
        seat_indices: Vec<i32>,
        total_seat_count: i32,
        user_id: i32,
    ) -> Result<(bool, String, Vec<i32>), Box<dyn std::error::Error + Send + Sync>> {
        let mut client = self.client.clone();

        let request = tonic::Request::new(locking::UnlockSlotRequest {
            showtime_id,
            seat_ids,
            user_id,
            total_seat_count,
            seat_indices,
        });

        match client.unlock_slot(request).await {
            Ok(response) => {
                let inner = response.into_inner();
                Ok((inner.success, inner.message, inner.unlocked_seat_ids))
            }
            Err(e) => Err(Box::new(e)),
        }
    }
}
