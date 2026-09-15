FROM rust:slim-bookworm AS chef
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends pkg-config libssl-dev protobuf-compiler lld clang ca-certificates && rm -rf /var/lib/apt/lists/*
RUN cargo install cargo-chef --locked
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release -p bookit-load-test-runner

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 runner
USER runner
COPY --from=builder /app/target/release/bookit-load-test-runner /usr/local/bin/bookit-load-test-runner
ENTRYPOINT ["/usr/local/bin/bookit-load-test-runner"]
