import re

with open("apps/http-server/src/api/admin/shows.rs", "r") as f:
    content = f.read()

# For create_show
content = re.sub(
    r'(let mut show: Show = body\.into\(\);\s*show\.created_at = Some\(Utc::now\(\)\);\s*)(let col = shows_col\(&state\);\s*let result = col\s*\.insert_one\(&show\)\s*\.await\s*\.map_err\(\|e\| AppError::internal\(e\.to_string\(\)\)\)\?;)',
    r'''\1
    let mut session = state.mongo_client.start_session().await.map_err(|e| AppError::internal(e.to_string()))?;
    session.start_transaction().await.map_err(|e| AppError::internal(e.to_string()))?;

    let col = shows_col(&state);
    let result = col
        .insert_one(&show)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let lsn_col = state.mongo_client.database(&state.mongo_db_name).collection::<bson::Document>("search_outbox_lsn");
    let lsn_doc = lsn_col
        .find_one_and_update(
            doc! { "_id": "elasticsearch_outbox" },
            doc! { "$inc": { "sequence": 1_i64 } }
        )
        .upsert(true)
        .return_document(mongodb::options::ReturnDocument::After)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::internal("Failed to generate LSN"))?;

    let sequence = lsn_doc.get_i64("sequence").unwrap_or(1);

    let inserted_id = result.inserted_id.as_object_id().unwrap_or_default();
    let outbox_col = state.mongo_client.database(&state.mongo_db_name).collection::<bson::Document>("search_outbox_events");
    let outbox_event = doc! {
        "sequence": sequence,
        "show_id": inserted_id.to_hex(),
        "operation": "upsert",
        "document": bson::to_document(&show).unwrap_or_default(),
        "trace_context": bson::Bson::Null,
        "created_at": bson::DateTime::now(),
    };
    outbox_col.insert_one(outbox_event).session(&mut session).await.map_err(|e| AppError::internal(e.to_string()))?;

    session.commit_transaction().await.map_err(|e| AppError::internal(e.to_string()))?;

    let inserted_id = inserted_id.to_hex();
''',
    content
)

# For update_show
content = re.sub(
    r'(let mut show: Show = body\.into\(\);\s*show\.id = Some\(oid\);\s*show\.created_at = existing\.created_at;\s*)(col\.replace_one\(doc! \{ "_id": oid \}, &show\)\s*\.await\s*\.map_err\(\|e\| AppError::internal\(e\.to_string\(\)\)\)\?;)',
    r'''\1
    let mut session = state.mongo_client.start_session().await.map_err(|e| AppError::internal(e.to_string()))?;
    session.start_transaction().await.map_err(|e| AppError::internal(e.to_string()))?;

    col.replace_one(doc! { "_id": oid }, &show)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let lsn_col = state.mongo_client.database(&state.mongo_db_name).collection::<bson::Document>("search_outbox_lsn");
    let lsn_doc = lsn_col
        .find_one_and_update(
            doc! { "_id": "elasticsearch_outbox" },
            doc! { "$inc": { "sequence": 1_i64 } }
        )
        .upsert(true)
        .return_document(mongodb::options::ReturnDocument::After)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::internal("Failed to generate LSN"))?;

    let sequence = lsn_doc.get_i64("sequence").unwrap_or(1);
    let outbox_col = state.mongo_client.database(&state.mongo_db_name).collection::<bson::Document>("search_outbox_events");
    let outbox_event = doc! {
        "sequence": sequence,
        "show_id": oid.to_hex(),
        "operation": "upsert",
        "document": bson::to_document(&show).unwrap_or_default(),
        "trace_context": bson::Bson::Null,
        "created_at": bson::DateTime::now(),
    };
    outbox_col.insert_one(outbox_event).session(&mut session).await.map_err(|e| AppError::internal(e.to_string()))?;

    session.commit_transaction().await.map_err(|e| AppError::internal(e.to_string()))?;
''',
    content
)

# For delete_show
content = re.sub(
    r'(let col = shows_col\(&state\);\s*)(col\.update_one\(\s*doc! \{ "_id": oid \},\s*doc! \{ "\$set": \{ "deleted_at": bson::DateTime::now\(\) \} \},\s*\)\s*\.await\s*\.map_err\(\|e\| AppError::internal\(e\.to_string\(\)\)\)\?;)',
    r'''\1
    let mut session = state.mongo_client.start_session().await.map_err(|e| AppError::internal(e.to_string()))?;
    session.start_transaction().await.map_err(|e| AppError::internal(e.to_string()))?;

    col.update_one(
        doc! { "_id": oid },
        doc! { "$set": { "deleted_at": bson::DateTime::now() } },
    )
    .session(&mut session)
    .await
    .map_err(|e| AppError::internal(e.to_string()))?;

    let lsn_col = state.mongo_client.database(&state.mongo_db_name).collection::<bson::Document>("search_outbox_lsn");
    let lsn_doc = lsn_col
        .find_one_and_update(
            doc! { "_id": "elasticsearch_outbox" },
            doc! { "$inc": { "sequence": 1_i64 } }
        )
        .upsert(true)
        .return_document(mongodb::options::ReturnDocument::After)
        .session(&mut session)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .ok_or_else(|| AppError::internal("Failed to generate LSN"))?;

    let sequence = lsn_doc.get_i64("sequence").unwrap_or(1);
    let outbox_col = state.mongo_client.database(&state.mongo_db_name).collection::<bson::Document>("search_outbox_events");
    let outbox_event = doc! {
        "sequence": sequence,
        "show_id": oid.to_hex(),
        "operation": "delete",
        "document": bson::Bson::Null,
        "trace_context": bson::Bson::Null,
        "created_at": bson::DateTime::now(),
    };
    outbox_col.insert_one(outbox_event).session(&mut session).await.map_err(|e| AppError::internal(e.to_string()))?;

    session.commit_transaction().await.map_err(|e| AppError::internal(e.to_string()))?;
''',
    content
)

# Remove the inserted_id block that I already replaced the usage of
content = re.sub(
    r'let inserted_id = result\s*\.inserted_id\s*\.as_object_id\(\)\s*\.map\(\|o\| o\.to_hex\(\)\)\s*\.unwrap_or_default\(\);\s*',
    r'',
    content
)

with open("apps/http-server/src/api/admin/shows.rs", "w") as f:
    f.write(content)

