import redis
import json
import os

redis_url = os.environ["REDIS_URL"]
r = redis.from_url(redis_url)
event = {
    "SeatLocked": {
        "user_id": 1,
        "showtime_id": 1,
        "seat_id": 10
    }
}
r.publish("room:1", json.dumps(event))
print("Published!")
