# syntax=docker/dockerfile:1
#
# Image GPU de Cadence : ComfyUI + llama.cpp derrière llama-swap + Tailscale, pour une carte NVIDIA
# Blackwell (RTX 50xx, RTX PRO 6000). Aucun modèle dedans : ils vivent sur le volume (/workspace).
# Mode d'emploi : deploy/gpu/README.md.
#
# Les couches les plus lourdes et les plus stables viennent en premier : modifier un profil ou
# l'entrypoint ne reconstruit que la dernière couche.

ARG CUDA_VERSION=12.8.1

# ── Étape 1 : llama.cpp compilé pour Blackwell ────────────────────────────────────────────────
FROM nvidia/cuda:${CUDA_VERSION}-devel-ubuntu24.04 AS llama
ARG LLAMA_CPP_REF=b12068
# 120 = Blackwell (RTX 5070 Ti, 5090, RTX PRO 6000). Ajouter « ;89 » pour une Ada (4090, RTX 6000 Ada).
ARG CUDA_ARCHS=120
RUN apt-get update && apt-get install -y --no-install-recommends git cmake build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${LLAMA_CPP_REF}" https://github.com/ggml-org/llama.cpp /src
WORKDIR /src
# GGML_CPU_ALL_VARIANTS + BACKEND_DL : un seul binaire qui choisit au démarrage le meilleur jeu
# d'instructions du processeur de l'hôte (les hôtes RunPod varient).
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCHS}" \
        -DGGML_NATIVE=OFF -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DLLAMA_CURL=OFF \
        -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
    && cmake --build build --config Release -j"$(nproc)" --target llama-server \
    && mkdir -p /out && cp build/bin/llama-server /out/ && cp build/bin/*.so* /out/

# ── Étape 2 : l'image d'exécution ─────────────────────────────────────────────────────────────
FROM nvidia/cuda:${CUDA_VERSION}-runtime-ubuntu24.04
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv python3-dev build-essential git curl ca-certificates ffmpeg \
        libgl1 libglib2.0-0 libgomp1 supervisor gettext-base iproute2 procps \
    && curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg \
    && curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list \
    && apt-get update && apt-get install -y --no-install-recommends tailscale \
    && rm -rf /var/lib/apt/lists/*

# llama-swap : le proxy qui charge et décharge les modèles de llama.cpp à la demande.
ARG LLAMA_SWAP_VERSION=269
RUN curl -fsSL "https://github.com/mostlygeek/llama-swap/releases/download/v${LLAMA_SWAP_VERSION}/llama-swap_${LLAMA_SWAP_VERSION}_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin llama-swap

COPY --from=llama /out/ /opt/llama/
ENV PATH="/opt/venv/bin:/opt/llama:${PATH}" LD_LIBRARY_PATH="/opt/llama:${LD_LIBRARY_PATH}"

# PyTorch pour Blackwell : cu128 minimum (la série 50 n'existe pas avant). cu130 demande un pilote plus récent côté hôte.
ARG TORCH_CHANNEL=cu128
RUN python3 -m venv /opt/venv \
    && pip install torch torchvision torchaudio --index-url "https://download.pytorch.org/whl/${TORCH_CHANNEL}" \
    && pip freeze | grep -iE '^(torch|torchvision|torchaudio|numpy)==' > /opt/torch-constraints.txt \
    && cat /opt/torch-constraints.txt

ARG COMFYUI_REF=v0.43.2
RUN git clone --depth 1 --branch "${COMFYUI_REF}" https://github.com/comfyanonymous/ComfyUI /opt/ComfyUI \
    && pip install -c /opt/torch-constraints.txt -r /opt/ComfyUI/requirements.txt

# Nodes custom : custom-nodes.txt, un dépôt par ligne, épinglé sur un commit. Les « requirements » des
# nodes passent sous contrainte pour qu'aucun ne remplace PyTorch par une autre version.
COPY custom-nodes.txt /tmp/custom-nodes.txt
RUN grep -vE '^\s*(#|$)' /tmp/custom-nodes.txt | while read -r url sha _; do \
        d="/opt/ComfyUI/custom_nodes/$(basename "$url")"; \
        echo "== $url @ $sha"; \
        git init -q "$d" && git -C "$d" remote add origin "$url" \
        && git -C "$d" fetch -q --depth 1 origin "$sha" && git -C "$d" checkout -q FETCH_HEAD \
        && if [ -f "$d/requirements.txt" ]; then pip install -c /opt/torch-constraints.txt -r "$d/requirements.txt"; fi; \
    done \
    && rm /tmp/custom-nodes.txt

# Ce qui change souvent vient en dernier.
COPY entrypoint.sh run-comfyui.sh tailscale-up.sh telecharger-modeles.sh veille.sh supervisord.conf models.manifest /opt/cadence/
COPY profils/ /opt/cadence/profils/
RUN chmod +x /opt/cadence/*.sh && cp -r /opt/ComfyUI/models /opt/ComfyUI/models.dist

# Contrôle de construction : la version de ComfyUI épinglée connaît bien chaque option de run-comfyui.sh
# (sinon ComfyUI refuserait de démarrer sur le Pod), et les binaires sont là.
RUN cd /opt/ComfyUI && python main.py --help > /tmp/aide.txt \
    && for o in --listen --enable-manager --vram-headroom --async-offload --fast-disk --disable-partner-nodes \
                --input-directory --output-directory --user-directory --temp-directory; do \
         grep -q -- "$o" /tmp/aide.txt || { echo "Option ComfyUI absente de cette version : $o"; exit 1; }; \
       done \
    && rm /tmp/aide.txt \
    && test -x /opt/llama/llama-server && llama-swap --version

# 8188 = ComfyUI, 8080 = llama-swap. Aucun n'est publié : l'accès passe par Tailscale.
EXPOSE 8188 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8188/system_stats >/dev/null && curl -fsS http://127.0.0.1:8080/health >/dev/null || exit 1
WORKDIR /opt/ComfyUI
CMD ["/opt/cadence/entrypoint.sh"]
