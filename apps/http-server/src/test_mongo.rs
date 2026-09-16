use anyhow::Result;
use mongodb::{Client, bson::doc};

pub async fn test_tx(client: Client) -> Result<()> {
    let mut session = client.start_session().await?;
    session.start_transaction().await?;
    let col = client
        .database("test")
        .collection::<mongodb::bson::Document>("test");
    col.insert_one(doc! {"a": 1}).session(&mut session).await?;

    session.commit_transaction().await?;
    Ok(())
}
