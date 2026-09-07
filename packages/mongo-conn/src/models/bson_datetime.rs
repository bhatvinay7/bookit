pub mod option_chrono_datetime_as_bson_datetime {
    use bson::DateTime as BsonDateTime;
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Deserializer, Serialize, Serializer, de};
    use std::fmt;

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
        struct DateTimeVisitor;

        impl<'de> de::Visitor<'de> for DateTimeVisitor {
            type Value = Option<DateTime<Utc>>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a BSON DateTime, an RFC 3339 string, or a map with $date")
            }

            fn visit_none<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(None)
            }

            fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: Deserializer<'de>,
            {
                // We use serde_json::Value as an intermediate representation to handle both map and string,
                // but since this might be BSON, we should use bson::Bson
                let bson = bson::Bson::deserialize(deserializer)?;
                match bson {
                    bson::Bson::DateTime(dt) => Ok(Some(dt.to_chrono())),
                    bson::Bson::String(s) => {
                        let dt = DateTime::parse_from_rfc3339(&s)
                            .map_err(de::Error::custom)?
                            .with_timezone(&Utc);
                        Ok(Some(dt))
                    }
                    bson::Bson::Document(mut doc) => {
                        if let Some(date_val) = doc.remove("$date") {
                            if let bson::Bson::String(s) = date_val {
                                let dt = DateTime::parse_from_rfc3339(&s)
                                    .map_err(de::Error::custom)?
                                    .with_timezone(&Utc);
                                Ok(Some(dt))
                            } else if let bson::Bson::Int64(ms) = date_val {
                                let dt = BsonDateTime::from_millis(ms).to_chrono();
                                Ok(Some(dt))
                            } else {
                                Err(de::Error::custom("unexpected $date format"))
                            }
                        } else {
                            Err(de::Error::custom("expected $date field in document"))
                        }
                    }
                    _ => Err(de::Error::custom("expected string, datetime, or document")),
                }
            }
        }

        deserializer.deserialize_option(DateTimeVisitor)
    }
}
