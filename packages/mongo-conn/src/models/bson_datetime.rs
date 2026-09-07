pub mod option_chrono_datetime_as_bson_datetime {
    use bson::DateTime as BsonDateTime;
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(val: &Option<DateTime<Utc>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match val {
            Some(dt) => {
                let bson_dt = BsonDateTime::from_chrono(*dt);
                bson_dt.serialize(serializer)
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<DateTime<Utc>>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bson_dt: Option<BsonDateTime> = Option::deserialize(deserializer)?;
        Ok(bson_dt.map(|dt| dt.to_chrono()))
    }
}
