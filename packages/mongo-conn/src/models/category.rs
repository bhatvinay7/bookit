use bson::oid::ObjectId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    #[serde(
        default,
        with = "crate::models::bson_datetime::option_chrono_datetime_as_bson_datetime"
    )]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(
        default,
        with = "crate::models::bson_datetime::option_chrono_datetime_as_bson_datetime"
    )]
    pub updated_at: Option<DateTime<Utc>>,
}
