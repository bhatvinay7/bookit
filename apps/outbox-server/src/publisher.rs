use std::collections::BTreeMap;

use anyhow::{Result, anyhow};
use lapin::{
    BasicProperties, Channel, Confirmation, ExchangeKind,
    options::{
        BasicPublishOptions, ConfirmSelectOptions, ExchangeDeclareOptions, QueueBindOptions,
        QueueDeclareOptions,
    },
    types::{AMQPValue, FieldTable},
};

use crate::{parse_payment_message_ttl, routing::route_for, store::ClaimedEvent};

pub async fn declare_topology(channel: &Channel) -> Result<()> {
    channel
        .confirm_select(ConfirmSelectOptions::default())
        .await?;
    channel
        .exchange_declare(
            "payment_dlx".into(),
            ExchangeKind::Direct,
            ExchangeDeclareOptions::default(),
            FieldTable::default(),
        )
        .await?;
    channel
        .queue_declare(
            "payment_failed".into(),
            QueueDeclareOptions::default(),
            FieldTable::default(),
        )
        .await?;
    channel
        .queue_bind(
            "payment_failed".into(),
            "payment_dlx".into(),
            "failed".into(),
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;

    let mut arguments = BTreeMap::new();
    arguments.insert(
        "x-dead-letter-exchange".into(),
        AMQPValue::LongString("payment_dlx".into()),
    );
    arguments.insert(
        "x-dead-letter-routing-key".into(),
        AMQPValue::LongString("failed".into()),
    );
    channel
        .queue_declare(
            "payment_processing".into(),
            QueueDeclareOptions::default(),
            FieldTable::from(arguments),
        )
        .await?;
    channel
        .exchange_declare(
            "booking_events_exchange".into(),
            ExchangeKind::Fanout,
            ExchangeDeclareOptions::default(),
            FieldTable::default(),
        )
        .await?;
    Ok(())
}

pub async fn publish(channel: &Channel, event: &ClaimedEvent) -> Result<()> {
    let route = route_for(&event.event_type)
        .ok_or_else(|| anyhow!("unsupported outbox event type {}", event.event_type))?;
    let body = serde_json::to_vec(&event.payload)?;
    let mut properties = BasicProperties::default()
        .with_delivery_mode(2)
        .with_message_id(event.id.to_string().into())
        .with_type(event.event_type.clone().into());
    if route.routing_key == "payment_processing" {
        let ttl =
            parse_payment_message_ttl(std::env::var("PAYMENT_MESSAGE_TTL_MS").ok().as_deref());
        properties = properties.with_expiration(ttl.to_string().into());
    }
    let confirmation = channel
        .basic_publish(
            route.exchange.into(),
            route.routing_key.into(),
            BasicPublishOptions {
                mandatory: true,
                ..Default::default()
            },
            &body,
            properties,
        )
        .await?
        .await?;
    match confirmation {
        Confirmation::Ack(None) => Ok(()),
        Confirmation::Ack(Some(_)) => Err(anyhow!("broker returned unroutable event")),
        Confirmation::Nack(_) => Err(anyhow!("broker negatively acknowledged event")),
        Confirmation::NotRequested => Err(anyhow!("publisher confirm was not requested")),
    }
}
