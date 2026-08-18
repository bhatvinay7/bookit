use bookit_mongo::models::show::Show;
use futures::StreamExt;
use mongodb::{bson::doc, Collection};
use reqwest::Client as HttpClient;
use serde_json::json;

pub async fn init_es_index(client: &HttpClient, es_url: &str) {
    let index_url = format!("{}/shows", es_url);

    // Check if index exists
    let res = client.head(&index_url).send().await;
    if let Ok(response) = res {
        if response.status().is_success() {
            println!("Elasticsearch index 'shows' already exists.");
            return;
        }
    }

    // Create index with edge_ngram for partial matching
    let settings = json!({
        "settings": {
            "analysis": {
                "analyzer": {
                    "autocomplete": {
                        "tokenizer": "autocomplete",
                        "filter": ["lowercase"]
                    },
                    "autocomplete_search": {
                        "tokenizer": "lowercase"
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
                    "search_analyzer": "autocomplete_search"
                },
                "description": { "type": "text" },
                "venue": { "type": "text" },
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

pub async fn initial_sync(coll: &Collection<Show>, client: &HttpClient, es_url: &str) {
    // Basic bulk index. For small datasets (<10,000 items), looping is fine.
    println!("Starting initial sync from MongoDB to Elasticsearch...");
    let mut cursor = coll.find(doc! {}).await.expect("Failed to find shows");

    let mut count = 0;
    while let Some(result) = cursor.next().await {
        if let Ok(show) = result {
            if let Some(oid) = &show.id {
                let doc_url = format!("{}/shows/_doc/{}", es_url, oid.to_hex());
                let _ = client.put(&doc_url).json(&show).send().await;
                count += 1;
            }
        }
    }
    println!("Initial sync complete. Indexed {} shows.", count);
}
