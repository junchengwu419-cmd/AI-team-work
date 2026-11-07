FROM gcc:13

RUN useradd -m -u 1000 runner \
    && mkdir -p /box \
    && chown runner:runner /box

WORKDIR /box

USER runner