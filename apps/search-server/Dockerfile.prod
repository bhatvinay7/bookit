FROM rust:slim-bookworm AS chef
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends pkg-config libssl-dev libpq-dev protobuf-compiler lld clang curl ca-certificates xz-utils && rm -rf /var/lib/apt/lists/*
RUN cargo install cargo-chef --locked
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Build dependent packages first (cached layer)
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin search-server

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y openssl ca-certificates libpq5 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/search-server /usr/local/bin/search-server
RUN useradd -m appuser
USER appuser
CMD ["search-server"]
