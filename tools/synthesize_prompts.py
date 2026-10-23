"""Synthesize the app's fixed spoken sentences with NVIDIA Magpie TTS (hosted API on build.nvidia.com).

One-time setup:
  1. Get a free key at https://build.nvidia.com/nvidia/magpie-tts-multilingual ("Get API Key").
  2. Put it in .env as  NVIDIA_API_KEY=nvapi-...   (never in the chat or the repository).

Run (the extra packages are only needed for this script, so they are not project dependencies):
  uv run --with nvidia-riva-client --with lameenc python tools/synthesize_prompts.py
  uv run --with nvidia-riva-client python tools/synthesize_prompts.py --list-voices
  uv run python tools/synthesize_prompts.py --dry-run          # only list the sentences

Already-made clips are kept, so re-running only synthesizes sentences that are new or changed.
"""
from __future__ import annotations

import argparse
import os
import sys

from scenepilot import config  # noqa: F401  (loads .env)
from scenepilot import prompt_audio

SERVER = "grpc.nvcf.nvidia.com:443"
FUNCTION_ID = "877104f7-e885-42b9-8de8-f6e4c6303969"  # Magpie TTS Multilingual on build.nvidia.com (from the model card)
SAMPLE_RATE = 22050


def connect():
    import riva.client

    key = os.environ.get("NVIDIA_API_KEY")
    if not key:
        sys.exit("NVIDIA_API_KEY is not set. Add it to .env (see the top of this file).")
    auth = riva.client.Auth(uri=SERVER, use_ssl=True, metadata_args=[["function-id", FUNCTION_ID], ["authorization", f"Bearer {key}"]])
    return riva.client, riva.client.SpeechSynthesisService(auth)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--voice", default=prompt_audio.DEFAULT_VOICE)
    parser.add_argument("--dry-run", action="store_true", help="list the sentences and exit")
    parser.add_argument("--list-voices", action="store_true", help="ask the service which voices it has and exit")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    prompts = prompt_audio.fixed_prompts()
    if args.dry_run:
        for text in prompts:
            print(text)
        print(f"\n{len(prompts)} sentences")
        return

    riva, service = connect()
    if args.list_voices:
        from riva.client.proto import riva_tts_pb2

        reply = service.stub.GetRivaSynthesisConfig(riva_tts_pb2.RivaSynthesisConfigRequest(), metadata=service.auth.get_auth_metadata())
        for model in reply.model_config:
            print(dict(model.parameters))
        return

    import lameenc
    from riva.client.proto.riva_audio_pb2 import AudioEncoding

    def synthesize(text: str) -> bytes:
        response = service.synthesize(text, args.voice, "en-US", sample_rate_hz=SAMPLE_RATE, encoding=AudioEncoding.LINEAR_PCM)
        return response.audio

    def encode(pcm: bytes) -> bytes:
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(48)
        encoder.set_in_sample_rate(SAMPLE_RATE)
        encoder.set_channels(1)
        encoder.set_quality(2)
        return bytes(encoder.encode(pcm) + encoder.flush())

    manifest = prompt_audio.build(prompts, prompt_audio.AUDIO_DIR, synthesize, encode, voice=args.voice, log=print)
    print(f"\n{len(prompts)} sentences, {manifest['_made']} newly synthesized, in {prompt_audio.AUDIO_DIR}")


if __name__ == "__main__":
    main()
