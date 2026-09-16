use reqwest::Client as HttpClient;
use serde_json::json;

pub async fn init_es_index(client: &HttpClient, es_url: &str) {
    let index_url = format!("{}/shows", es_url);

    // Check if index exists
    let res = client.head(&index_url).send().await;
    if let Ok(response) = res
        && response.status().is_success()
    {
        println!("Elasticsearch index 'shows' already exists.");
        return;
    }

    // Create index with edge_ngram for partial matching
    let settings = json!({
        "settings": {
            "analysis": {
                "filter": {
                    "phonetic_filter": {
                        "type": "phonetic",
                        "encoder": "double_metaphone",
                        "replace": false
                    }
                },
                "analyzer": {
                    "autocomplete": {
                        "tokenizer": "autocomplete",
                        "filter": ["lowercase"]
                    },
                    "autocomplete_search": {
                        "tokenizer": "lowercase"
                    },
                    "phonetic_analyzer": {
                        "tokenizer": "standard",
                        "filter": ["lowercase", "phonetic_filter"]
                    }
                },
                "tokenizer": {
                    "autocomplete": {
                        "type": "edge_ngram",
                        "min_gram": 2,
                        "max_gram": 20,
                        "token_chars": ["letter", "digit"]
                    }
                }
            }
        },
        "mappings": {
            "properties": {
                "title": {
                    "type": "text",
                    "analyzer": "autocomplete",
                    "search_analyzer": "autocomplete_search",
                    "fields": {
                        "phonetic": {
                            "type": "text",
                            "analyzer": "phonetic_analyzer"
                        }
                    }
                },
                "description": { "type": "text" },
                "city": {
                    "type": "keyword",
                    "fields": { "text": { "type": "text" } }
                },
                "venue": {
                    "type": "text",
                    "fields": { "keyword": { "type": "keyword", "ignore_above": 256 } }
                },
                "thumbnail_url": { "type": "keyword", "index": false },
                "poster_url": { "type": "keyword", "index": false },
                "category_ids": { "type": "keyword" },
                "tags": { "type": "keyword" },
                "show_type": { "type": "keyword" }
            }
        }
    });

    let res = client.put(&index_url).json(&settings).send().await;
    match res {
        Ok(r) if r.status().is_success() => println!("Created 'shows' index successfully."),
        Ok(r) => eprintln!("Failed to create index: {:?}", r.text().await),
        Err(e) => eprintln!("Failed to connect to Elasticsearch: {}", e),
    }
}
