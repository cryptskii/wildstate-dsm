# Build with the DSM integration checkout as the build context:
# docker build --platform linux/amd64 -f /absolute/path/to/this/Dockerfile -t wildstate-account:production /absolute/path/to/dsm-integration-checkout
FROM rust:1.98-slim-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config libssl-dev protobuf-compiler python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY . .
ENV DSM_PROTO_ROOT=/build/proto
RUN cargo build --release --locked -p dsm-app-host

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/* && groupadd -g 10001 wildstate && useradd -u 10001 -g 10001 -d /data -s /usr/sbin/nologin wildstate
COPY --from=build /build/target/release/dsm-app-host /usr/local/bin/dsm-app-host
USER 10001:10001
WORKDIR /data
ENTRYPOINT ["/usr/local/bin/dsm-app-host"]
