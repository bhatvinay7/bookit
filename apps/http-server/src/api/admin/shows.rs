use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use bson::{doc, oid::ObjectId};
use chrono::Utc;
use mongodb::Collection;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, env, sync::Arc};

use crate::api::state::AppState;
use crate::helpers::errors::AppError;
use crate::services::cache::invalidate_async;
use bookit_mongo::models::{CreateShowRequest, Show, ShowType};
use bookit_redis::keys::{cache_schedules_active_key, cache_show_key};

fn shows_col(state: &AppState) -> Collection<Show> {
    state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection("shows")
}

/// Search the admin catalogue in Elasticsearch. `None` means Elasticsearch is
/// unavailable or returned an invalid response; callers must fall back to the
/// MongoDB search path in that case. An empty vector is a valid ES result.
async fn elasticsearch_show_ids(
    search: &str,
    show_type: Option<&str>,
    from: u64,
    limit: i64,
) -> Option<Vec<String>> {
    let base_url = env::var("ELASTICSEARCH_URL").ok()?;
    let base_url = base_url.trim_end_matches('/');
    if base_url.is_empty() {
        return None;
    }

    let mut filters = Vec::new();
    if let Some(show_type) = show_type.filter(|value| !value.trim().is_empty()) {
        filters.push(serde_json::json!({ "term": { "show_type": show_type } }));
    }

    let body = serde_json::json!({
        "from": from,
        "size": limit,
        "_source": false,
        "query": {
            "bool": {
                "must": [{
                    "multi_match": {
                        "query": search,
                        "fields": ["title^3", "tags^2", "venue", "description", "category_ids"],
                        "fuzziness": "AUTO"
                    }
                }],
                "filter": filters,
                "must_not": [{ "exists": { "field": "deleted_at" } }]
            }
        }
    });

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(2))
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .ok()?;
    let response = client
        .post(format!("{base_url}/shows/_search"))
        .json(&body)
        .send()
        .await;

    let response = match response {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            tracing::warn!(status = %response.status(), "Elasticsearch admin show search failed");
            return None;
        }
        Err(error) => {
            tracing::warn!(%error, "Elasticsearch admin show search unavailable; using MongoDB fallback");
            return None;
        }
    };

    let payload: serde_json::Value = match response.json().await {
        Ok(payload) => payload,
        Err(error) => {
            tracing::warn!(%error, "Elasticsearch admin show search returned invalid JSON");
            return None;
        }
    };
    let hits = payload
        .pointer("/hits/hits")
        .and_then(serde_json::Value::as_array)?;

    Some(
        hits.iter()
            .filter_map(|hit| hit.get("_id").and_then(serde_json::Value::as_str))
            .map(str::to_owned)
            .collect(),
    )
}

// ─── List shows ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListShowsQuery {
    pub show_type: Option<String>,
    pub search: Option<String>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

#[derive(Serialize)]
pub struct ShowSummary {
    pub id: String,
    pub show_type: ShowType,
    pub title: String,
    pub status: String,
    pub poster_url: Option<String>,
    pub duration_minutes: Option<i32>,
    pub tags: Vec<String>,
}

pub async fn list_shows(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListShowsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let col = shows_col(&state);

    // Active shows created by the current schema store `deleted_at: null`.
    // MongoDB's null match also includes legacy records where the field is
    // absent, so both document versions remain visible to administrators.
    let mut filter = doc! { "deleted_at": null };
    if let Some(st) = &q.show_type {
        filter.insert("show_type", st.as_str());
    }
    let limit = q.limit.unwrap_or(50).min(200) as i64;
    let page = q.page.unwrap_or(0);
    let search = q
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let elastic_ids = if let Some(search) = search {
        elasticsearch_show_ids(search, q.show_type.as_deref(), page * limit as u64, limit).await
    } else {
        None
    };

    if let Some(ids) = &elastic_ids {
        let ids: Vec<ObjectId> = ids
            .iter()
            .filter_map(|id| ObjectId::parse_str(id).ok())
            .collect();
        filter.insert("_id", doc! { "$in": ids });
    } else if let Some(s) = search {
        filter.insert(
            "$or",
            bson::to_bson(&[
                doc! { "title":  { "$regex": s, "$options": "i" } },
                doc! { "tags":   { "$elemMatch": { "$regex": s, "$options": "i" } } },
            ])?,
        );
    }

    // Elasticsearch already applies pagination. MongoDB only needs to skip
    // records when using the fallback path.
    let skip = if elastic_ids.is_some() {
        0
    } else {
        page * limit as u64
    };

    let opts = mongodb::options::FindOptions::builder()
        .limit(limit)
        .skip(skip)
        .sort(doc! { "created_at": -1 })
        .build();

    let mut cursor = col
        .find(filter)
        .with_options(opts)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut results: Vec<serde_json::Value> = vec![];
    while cursor
        .advance()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
    {
        // A legacy or malformed document must not turn an otherwise valid
        // admin collection into a 5xx response. Skip it and keep serving the
        // remaining shows; the warning identifies data that needs repair.
        let show = match cursor.deserialize_current() {
            Ok(show) => show,
            Err(error) => {
                tracing::warn!(%error, "skipping malformed show document in admin list");
                continue;
            }
        };
        let id = show.id.map(|o| o.to_hex()).unwrap_or_default();
        let mut val = serde_json::to_value(&show)
            .map_err(|e| AppError::internal(format!("Failed to serialize show: {e}")))?;
        if let Some(obj) = val.as_object_mut() {
            obj.insert("id".to_string(), serde_json::json!(id));
            obj.remove("_id");
        }
        results.push(val);
    }

    if let Some(ids) = elastic_ids {
        let rank: HashMap<&str, usize> = ids
            .iter()
            .enumerate()
            .map(|(position, id)| (id.as_str(), position))
            .collect();
        results.sort_by_key(|show| {
            show.get("id")
                .and_then(serde_json::Value::as_str)
                .and_then(|id| rank.get(id))
                .copied()
                .unwrap_or(usize::MAX)
        });
    }

    Ok(Json(results))
}

// ─── Get show detail ──────────────────────────────────────────────────────────

pub async fn get_show(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::bad_request("Invalid show id"))?;

    let col = shows_col(&state);
    let show = col
        .find_one(doc! { "_id": oid })
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("Show not found"))?;

    let mut val = serde_json::to_value(&show)
        .map_err(|e| AppError::internal(format!("Failed to serialize show: {e}")))?;
    if let Some(obj) = val.as_object_mut() {
        obj.insert("id".to_string(), serde_json::json!(id));
        obj.remove("_id");
    }
    Ok(Json(val))
}

// ─── Create show ──────────────────────────────────────────────────────────────

pub async fn create_show(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateShowRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("title is required"));
    }

    let mut show: Show = body.into();
    show.created_at = Some(Utc::now());

    let mut session = state
        .mongo_client
        .start_session()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    session
        .start_transaction()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let col = shows_col(&state);
    let result = col
        .insert_one(&show)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let lsn_col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<bson::Document>("search_outbox_lsn");
    let lsn_doc = lsn_col
        .find_one_and_update(
            doc! { "_id": "elasticsearch_outbox" },
            doc! { "$inc": { "sequence": 1_i64 } },
        )
        .upsert(true)
        .return_document(mongodb::options::ReturnDocument::After)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::internal("Failed to generate LSN"))?;

    let sequence = lsn_doc.get_i64("sequence").unwrap_or(1);

    let inserted_id = result.inserted_id.as_object_id().unwrap_or_default();
    let outbox_col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<bson::Document>("search_outbox_events");
    let outbox_event = doc! {
        "sequence": sequence,
        "show_id": inserted_id.to_hex(),
        "operation": "upsert",
        "document": bson::to_document(&show).unwrap_or_default(),
        "trace_context": bson::Bson::Null,
        "created_at": bson::DateTime::now(),
    };
    outbox_col
        .insert_one(outbox_event)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    session
        .commit_transaction()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let inserted_id = inserted_id.to_hex();

    invalidate_async(&state, bookit_redis::keys::CACHE_SHOWS).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_DASHBOARD_GRID).await;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": inserted_id })),
    ))
}

// ─── Update show ──────────────────────────────────────────────────────────────

pub async fn update_show(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateShowRequest>,
) -> Result<impl IntoResponse, AppError> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::bad_request("Invalid show id"))?;

    let col = shows_col(&state);

    // Fetch existing to preserve created_at
    let existing = col
        .find_one(doc! { "_id": oid })
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::not_found("Show not found"))?;

    let mut show: Show = body.into();
    show.id = Some(oid);
    show.created_at = existing.created_at;

    let mut session = state
        .mongo_client
        .start_session()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    session
        .start_transaction()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    col.replace_one(doc! { "_id": oid }, &show)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let lsn_col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<bson::Document>("search_outbox_lsn");
    let lsn_doc = lsn_col
        .find_one_and_update(
            doc! { "_id": "elasticsearch_outbox" },
            doc! { "$inc": { "sequence": 1_i64 } },
        )
        .upsert(true)
        .return_document(mongodb::options::ReturnDocument::After)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::internal("Failed to generate LSN"))?;

    let sequence = lsn_doc.get_i64("sequence").unwrap_or(1);
    let outbox_col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<bson::Document>("search_outbox_events");
    let outbox_event = doc! {
        "sequence": sequence,
        "show_id": oid.to_hex(),
        "operation": "upsert",
        "document": bson::to_document(&show).unwrap_or_default(),
        "trace_context": bson::Bson::Null,
        "created_at": bson::DateTime::now(),
    };
    outbox_col
        .insert_one(outbox_event)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    session
        .commit_transaction()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    invalidate_async(&state, &cache_show_key(&id)).await;
    invalidate_async(&state, &cache_schedules_active_key()).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_SHOWS).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_DASHBOARD_GRID).await;

    Ok(Json(serde_json::json!({ "updated": true })))
}

// ─── Soft delete show ─────────────────────────────────────────────────────────

pub async fn delete_show(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::bad_request("Invalid show id"))?;

    let col = shows_col(&state);

    let mut session = state
        .mongo_client
        .start_session()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    session
        .start_transaction()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    col.update_one(
        doc! { "_id": oid },
        doc! { "$set": { "deleted_at": bson::DateTime::now() } },
    )
    .session(&mut session)
    .await
    .map_err(|e| AppError::internal(e.to_string()))?;

    let lsn_col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<bson::Document>("search_outbox_lsn");
    let lsn_doc = lsn_col
        .find_one_and_update(
            doc! { "_id": "elasticsearch_outbox" },
            doc! { "$inc": { "sequence": 1_i64 } },
        )
        .upsert(true)
        .return_document(mongodb::options::ReturnDocument::After)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::internal("Failed to generate LSN"))?;

    let sequence = lsn_doc.get_i64("sequence").unwrap_or(1);
    let outbox_col = state
        .mongo_client
        .database(&state.mongo_db_name)
        .collection::<bson::Document>("search_outbox_events");
    let outbox_event = doc! {
        "sequence": sequence,
        "show_id": oid.to_hex(),
        "operation": "delete",
        "document": bson::Bson::Null,
        "trace_context": bson::Bson::Null,
        "created_at": bson::DateTime::now(),
    };
    outbox_col
        .insert_one(outbox_event)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    session
        .commit_transaction()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    invalidate_async(&state, &cache_show_key(&id)).await;
    invalidate_async(&state, &cache_schedules_active_key()).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_SHOWS).await;
    invalidate_async(&state, bookit_redis::keys::CACHE_DASHBOARD_GRID).await;

    Ok(Json(serde_json::json!({ "deleted": true })))
}
