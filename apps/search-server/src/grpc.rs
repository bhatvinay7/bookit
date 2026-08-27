use serde_json::{Value, json};
use std::sync::Arc;
use tonic::{Request, Response, Status};

use bookit_proto::search::search_service_server::SearchService;
use bookit_proto::search::{SearchRequest, SearchResponse};

use crate::types::AppState;

pub struct GrpcSearchService {
    state: Arc<AppState>,
}

impl GrpcSearchService {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

#[tonic::async_trait]
impl SearchService for GrpcSearchService {
    async fn search(
        &self,
        request: Request<SearchRequest>,
    ) -> Result<Response<SearchResponse>, Status> {
        let req = request.into_inner();

        if req.query.trim().is_empty() {
            return Ok(Response::new(SearchResponse {
                results_json: "[]".to_string(),
            }));
        }

        let search_url = format!("{}/shows/_search", self.state.es_url);

        use bookit_db::schema::schedules;
        use diesel::prelude::*;

        let mut conn = match self.state.db_pool.get() {
            Ok(c) => c,
            Err(e) => return Err(Status::internal(format!("Database error: {}", e))),
        };

        let mut active_schedules = schedules::table
            .select(schedules::mongo_show_id)
            .filter(schedules::start_time.gt(chrono::Utc::now()))
            .filter(schedules::deleted_at.is_null())
            .into_boxed();

        let city = req.city.trim();
        if !city.is_empty() && !city.eq_ignore_ascii_case("All") {
            active_schedules = active_schedules.filter(schedules::venue_city.eq(city));
        }

        let active_show_ids: Vec<String> = active_schedules
            .distinct()
            .load::<String>(&mut conn)
            .unwrap_or_default();

        if active_show_ids.is_empty() {
            return Ok(Response::new(SearchResponse {
                results_json: "[]".to_string(),
            }));
        }

        let filters = vec![json!({
            "terms": { "_id": active_show_ids }
        })];

        let es_query = json!({
            "query": {
                "bool": {
                    "must": [
                        {
                            "multi_match": {
                                "query": req.query,
                                "fields": ["title^3", "tags^2", "venue", "description"],
                                "fuzziness": "AUTO"
                            }
                        }
                    ],
                    "filter": filters,
                    "must_not": [
                        {
                            "exists": { "field": "deleted_at" }
                        }
                    ]
                }
            },
            "size": 20
        });

        let res = self
            .state
            .es_client
            .post(&search_url)
            .json(&es_query)
            .send()
            .await;

        let mut shows = Vec::new();

        if let Ok(response) = res {
            if let Ok(body) = response.json::<Value>().await {
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
                            shows.push(json!({
                                "id": id,
                                "title": title,
                                "image": source.get("poster_url").cloned().unwrap_or(Value::Null),
                                "poster_url": source.get("poster_url").cloned().unwrap_or(Value::Null),
                                "thumbnail_url": source.get("thumbnail_url").cloned().unwrap_or(Value::Null),
                                "venue": source.get("venue").cloned().unwrap_or(Value::Null),
                                "city": source.get("city").cloned().unwrap_or(Value::Null),
                                "show_type": source.get("show_type").cloned().unwrap_or(json!("Event")),
                                "tags": source.get("tags").cloned().unwrap_or(json!([]))
                            }));
                        }
                    }
                }
            }
        }

        let results_json = serde_json::to_string(&shows).unwrap_or_else(|_| "[]".to_string());

        Ok(Response::new(SearchResponse { results_json }))
    }
}
