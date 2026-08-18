use redis::{Client, AsyncCommands};
#[tokio::main]
async fn main() {
    let url = std::env::var("REDIS_URL").unwrap();
    println!("Connecting to {}", url);
    match Client::open(url) {
        Ok(client) => match client.get_async_pubsub().await {
            Ok(_) => println!("Pubsub OK"),
            Err(e) => println!("Pubsub Error: {:?}", e),
        },
        Err(e) => println!("Client Error: {:?}", e),
    }
}
