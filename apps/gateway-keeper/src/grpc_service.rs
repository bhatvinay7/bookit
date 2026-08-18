use tonic::{Request, Response, Status};

use crate::locking::slot_locking_service_server::SlotLockingService;
use crate::locking::{LockSlotRequest, LockSlotResponse, UnlockSlotRequest, UnlockSlotResponse};
use crate::state::GatewayState;

#[derive(Clone)]
pub struct GatewayLockingService {
    gateway: GatewayState,
}

impl GatewayLockingService {
    pub fn new(gateway: GatewayState) -> Self {
        Self { gateway }
    }
}

#[tonic::async_trait]
impl SlotLockingService for GatewayLockingService {
    async fn lock_slot(
        &self,
        request: Request<LockSlotRequest>,
    ) -> Result<Response<LockSlotResponse>, Status> {
        let request = request.into_inner();
        if request.showtime_id < 0
            || request.seat_ids.is_empty()
            || request.seat_ids.iter().any(|id| *id < 0)
        {
            return Err(Status::invalid_argument(
                "showtime_id and seat_ids are required",
            ));
        }
        let result = self
            .gateway
            .lock(request.user_id, request.showtime_id, request.seat_ids)
            .await;
        Ok(Response::new(LockSlotResponse {
            success: !result.locked_seat_ids.is_empty(),
            message: "Lock request processed by gateway keeper".into(),
            locked_seat_ids: result.locked_seat_ids,
            failed_seat_ids: result.failed_seat_ids,
        }))
    }

    async fn unlock_slot(
        &self,
        request: Request<UnlockSlotRequest>,
    ) -> Result<Response<UnlockSlotResponse>, Status> {
        let request = request.into_inner();
        if request.showtime_id < 0
            || request.seat_ids.is_empty()
            || request.seat_ids.iter().any(|id| *id < 0)
        {
            return Err(Status::invalid_argument(
                "showtime_id and seat_ids are required",
            ));
        }
        let unlocked_seat_ids = match self
            .gateway
            .cancel(request.user_id, request.showtime_id, request.seat_ids)
            .await
        {
            Ok(ids) => ids,
            Err(e) => {
                return Err(Status::invalid_argument(e));
            }
        };
        Ok(Response::new(UnlockSlotResponse {
            success: !unlocked_seat_ids.is_empty(),
            message: "Cancellation processed by gateway keeper".into(),
            unlocked_seat_ids,
        }))
    }
}
