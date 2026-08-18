import redis
import json

r = redis.from_url("rediss://default:AVNS_1lQHyA9NXSNGAPHHnc1@valkey-32066234-bhatvinay75-d939.d.aivencloud.com:22543")
event = {
    "SeatLocked": {
        "user_id": 1,
        "showtime_id": 1,
        "seat_id": 10
    }
}
r.publish("room:1", json.dumps(event))
print("Published!")
