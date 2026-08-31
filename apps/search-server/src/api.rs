use axum::{
    Json,
    extract::{Query, State},
};
use serde_json::{Value, json};
use std::sync::Arc;

use crate::types::{AppState, SearchQuery};

pub async fn search_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Json<Value> {
    if query.q.trim().is_empty() {
        return Json(json!([]));
    }

    let search_url = format!("{}/shows/_search", state.es_url);

    let query_obj = json!({
        "bool": {
            "should": [
                {
                    "multi_match": {
                        "query": &query.q,
                        "fields": ["title^3", "tags^2", "venue", "description", "category_ids", "show_type"],
                        "fuzziness": "AUTO"
                    }
                },
                {
                    "multi_match": {
                        "query": &query.q,
                        "fields": ["title.phonetic^2"],
                        "analyzer": "phonetic_analyzer"
                    }
                }
            ],
            "minimum_should_match": 1
        }
    });

    let es_query = if let Some(city) = &query.city {
        json!({
            "query": {
                "bool": {
                    "must": query_obj,
                    "filter": {
                        "match": {
                            "city": city
                        }
                    }
                }
            },
            "size": 20
        })
    } else {
        json!({
            "query": query_obj,
            "size": 20
        })
    };

    let res = state
        .es_client
        .post(&search_url)
        .json(&es_query)
        .send()
        .await;

    if let Ok(response) = res
        && let Ok(body) = response.json::<Value>().await
    {
        let mut shows = Vec::new();
        if let Some(hits) = body
            .get("hits")
            .and_then(|h| h.get("hits"))
            .and_then(|h| h.as_array())
        {
            for hit in hits {
                if let Some(source) = hit.get("_source") {
                    let id = hit
                        .get("_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let title = source
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let poster_url = source
                        .get("poster_url")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let thumbnail_url = source
                        .get("thumbnail_url")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let venue = source
                        .get("venue")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let city = source
                        .get("city")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let show_type = source
                        .get("show_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Event")
                        .to_string();
                    let tags = source.get("tags").cloned().unwrap_or(json!([]));

                    shows.push(json!({
                        "id": id,
                        "title": title,
                        "poster_url": poster_url,
                        "thumbnail_url": thumbnail_url,
                        "venue": venue,
                        "city": city,
                        "show_type": show_type,
                        "tags": tags
                    }));
                }
            }
        }
        return Json(json!(shows));
    }

    Json(json!([]))
}
